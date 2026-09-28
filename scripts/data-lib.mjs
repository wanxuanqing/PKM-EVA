import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
export const hash = (content) => createHash('sha256').update(content).digest('hex');
export const nameKey = (name) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/♀/g, ' female ')
    .replace(/♂/g, ' male ')
    .replace(/\bforme?\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
export function parseCatalog(text) {
  const rows = parse(text, {
    columns: (header) => header.map((s) => s.trim()),
    bom: true,
    skip_empty_lines: true,
  });
  const required = [
    'Pokémon / form',
    'Pokédex #',
    'Form ID',
    'Status',
    'Best uses',
    'Great League target (<200)',
    'Ultra League target (<200)',
    'Master League target (<200)',
    'Raid target',
  ];
  if (!rows.length || required.some((k) => !(k in rows[0])))
    throw new Error('CSV is empty or missing required columns.');
  if (new Set(rows.map((r) => r['Form ID'])).size !== rows.length)
    throw new Error('Duplicate CSV form IDs.');
  if (rows.some((r) => !r['Form ID'] || !/^\d+$/.test(r['Pokédex #'])))
    throw new Error('Malformed CSV form ID or Pokédex number.');
  return rows;
}
export function extractRaidFacts(html) {
  const $ = load(html);
  const tables = $('table').toArray();
  const types = [
    'normal',
    'fighting',
    'flying',
    'poison',
    'ground',
    'rock',
    'bug',
    'ghost',
    'steel',
    'fire',
    'water',
    'grass',
    'electric',
    'psychic',
    'ice',
    'dragon',
    'dark',
    'fairy',
  ];
  if (tables.length !== 18)
    throw new Error('Raid source schema changed: expected 18 type tables; manual review required.');
  return tables.flatMap((table, index) => {
    const heading = $(table)
      .parents()
      .toArray()
      .map((p) => $(p).find('h1,h2,h3').first().text())
      .find((t) => /Top 10 .*?-type Attackers/.test(t));
    const type = heading?.match(/Top 10 ([A-Za-z]+)-type Attackers/)?.[1].toLowerCase();
    if (type !== types[index])
      throw new Error('Raid table order or headings changed; manual review required.');
    const rows = $(table).find('tr').toArray().slice(1);
    if (rows.length !== 10) throw new Error('Incomplete raid source table.');
    return rows.map((row) => {
      const cells = $(row).find('td');
      const rank = parseInt(cells.eq(0).text(), 10);
      const name = cells.eq(1).text().trim();
      const fast = cells.eq(2).text().trim();
      const charged = cells.eq(3).text().trim();
      if (!name || !(rank >= 1 && rank <= 10) || !fast || !charged)
        throw new Error('Malformed raid source row.');
      return { type, rank, name, moves: [fast, charged] };
    });
  });
}
const cleanGo = (s) =>
  s
    .toLowerCase()
    .replace(/_normal$/, '')
    .replace(/_alola$/, '_alolan');
const pretty = (s) =>
  s
    .replace(/^ITEM_/, '')
    .replaceAll('_', ' ')
    .toLowerCase();
export function normalizeData({
  gm,
  go,
  rankings,
  rows,
  cpm,
  rules,
  raidFacts,
  retrieved,
  sources,
  version,
}) {
  const rowMap = new Map(rows.map((r) => [r['Form ID'], r]));
  const gmMap = new Map(gm.pokemon.map((p) => [p.speciesId, p]));
  const goMap = new Map(
    go
      .filter((x) => x.data?.pokemonSettings)
      .map((x) => {
        const p = x.data.pokemonSettings;
        return [cleanGo(p.form || p.pokemonId), p];
      }),
  );
  // Explicitly model Dusk-capable Rockruff as a distinct GO form, with GO stats.
  const dusk = goMap.get('rockruff_dusk');
  if (dusk && !gmMap.has('rockruff_dusk'))
    gmMap.set('rockruff_dusk', {
      ...gmMap.get('rockruff'),
      speciesId: 'rockruff_dusk',
      speciesName: 'Rockruff (Dusk-capable)',
      baseStats: {
        atk: dusk.stats.baseAttack,
        def: dusk.stats.baseDefense,
        hp: dusk.stats.baseStamina,
      },
      nicknames: ['dusk rockruff'],
      family: undefined,
    });
  const byName = new Map(gm.pokemon.map((p) => [nameKey(p.speciesName), p.speciesId]));
  rows.forEach((r) => byName.set(nameKey(r['Pokémon / form']), r['Form ID']));
  const inverseAlias = new Map(Object.entries(rules.goAliases).map(([id, go]) => [go, id]));
  const resolveGo = (s) =>
    rules.evolutionAliases?.[cleanGo(s)] ?? inverseAlias.get(cleanGo(s)) ?? cleanGo(s);
  const ranked = new Map();
  for (const [league, list] of Object.entries(rankings)) {
    if (
      !Array.isArray(list) ||
      list.length < 200 ||
      new Set(list.map((r) => r.speciesId)).size !== list.length
    )
      throw new Error(`Invalid ${league} rankings.`);
    list.forEach((r, i) => {
      if (!gmMap.has(r.speciesId)) throw new Error(`Ranking has unknown form ${r.speciesId}.`);
      const p = gmMap.get(r.speciesId);
      const moves = (r.moveset ?? [])
        .map((id) => {
          if (![...p.fastMoves, ...p.chargedMoves].includes(id)) return null;
          const move = gm.moves.find((m) => m.moveId === id);
          return move
            ? {
                name: move.name,
                elite: (p.eliteMoves ?? []).includes(id),
                legacy: (p.legacyMoves ?? []).includes(id),
              }
            : null;
        })
        .filter(Boolean);
      if (!ranked.has(r.speciesId)) ranked.set(r.speciesId, {});
      ranked.get(r.speciesId)[league] = { rank: i + 1, score: r.score, moves, source: 'pvpoke' };
    });
  }
  const audit = {
    warnings: [],
    missingStats: [],
    missingEvolutionRules: [],
    rejectedEdges: [],
    csvRankChanges: 0,
    csvRaidClaims: 0,
    unknownRelease: rows.length,
  };
  // Include the complete CSV plus source-backed evolution targets, never a main-series Pokédex guess.
  const ids = new Set(rows.map((r) => r['Form ID']));
  // These GO forms / intermediate stages are missing from the CSV despite being relevant.
  for (const id of ['spewpa', 'cosmog', 'cosmoem', 'rockruff_dusk']) if (gmMap.has(id)) ids.add(id);
  for (const p of gm.pokemon)
    if (p.released && (p.family || ranked.has(p.speciesId))) ids.add(p.speciesId);
  const species = [];
  for (const id of ids) {
    const p = gmMap.get(id),
      row = rowMap.get(id);
    const shadow = (p?.tags ?? []).includes('shadow') || id.endsWith('_shadow');
    const temporary = (p?.tags ?? []).includes('mega') || /_mega|_primal/.test(id);
    const baseId = id.replace(/_shadow$/, '');
    const game = goMap.get(rules.goAliases[baseId] ?? baseId);
    const notes = [];
    if (!p) audit.missingStats.push(id);
    if (!game && !temporary) {
      audit.missingEvolutionRules.push(id);
      notes.push('Evolution and trade rules for this exact form are not fully mapped.');
    }
    if (rules.notes[id]) notes.push(rules.notes[id]);
    if (!row)
      notes.push(
        'Supplemental source-backed form or evolution stage absent from the original CSV; its release status is not inferred from simulator flags.',
      );
    const baseEligible = !!p && !temporary && !['ditto', 'shedinja'].includes(id);
    const target = {
      id,
      dex: row ? Number(row['Pokédex #']) : p.dex,
      name: row?.['Pokémon / form'] ?? p.speciesName,
      aliases: [
        ...(p?.nicknames ?? []),
        ...(!shadow && !temporary ? [`${p?.speciesName} regular`, `${p?.speciesName} normal`] : []),
      ],
      types: (p?.types ?? []).filter((t) => t !== 'none'),
      baseStats: p?.baseStats ?? null,
      shadow,
      temporary,
      tradable:
        shadow || temporary || p?.tags?.includes('untradeable')
          ? false
          : typeof game?.isTradable === 'boolean'
            ? game.isTradable
            : null,
      minLevel: Math.max(p?.levelFloor ?? 1, rules.minimumLevels[baseId] ?? 1),
      eligible: {
        GL: baseEligible && !gm.greatLeagueIneligible.includes(id),
        UL: baseEligible,
        ML: baseEligible,
      },
      rankings: ranked.get(id) ?? {},
      evolutions: [],
      raid: [],
      availability: {
        status: 'unverified',
        note: 'CSV and simulator availability flags are not independent confirmation of a GO release.',
      },
      notes,
      csv: null,
    };
    if (row) {
      const pvp = [];
      for (const [league, title] of [
        ['GL', 'Great'],
        ['UL', 'Ultra'],
        ['ML', 'Master'],
      ]) {
        const claim = row[`${title} League target (<200)`];
        if (!claim) continue;
        const match = claim.match(/^(.*?)\s+#(\d+)$/);
        if (!match) throw new Error(`Unparseable CSV target: ${claim}`);
        const targetId = byName.get(nameKey(match[1])) ?? null;
        const rank = Number(match[2]);
        if (ranked.get(targetId)?.[league]?.rank !== rank) audit.csvRankChanges++;
        pvp.push({ league, targetId, rank, ideal: row[`Best ${league} IV`] ?? '' });
      }
      const raidLabel = row['Raid target'] ?? '';
      const raidName = raidLabel.replace(/\s+\([^()]+(?:listing|backup)\)$/, '');
      const raidTargetId = raidLabel ? (byName.get(nameKey(raidName)) ?? null) : null;
      if (raidLabel) audit.csvRaidClaims++;
      target.csv = {
        status: row.Status,
        uses: row['Best uses'].split(/,\s*/).filter(Boolean),
        pvp,
        raidTargetId,
        raidLabel,
      };
    }
    // GO templates define normal evolution branches, gender conditions, and temporary evolution.
    // Never inherit base-form branches for costumes, regional forms or battle-specific forms.
    if (game && !temporary)
      for (const branch of game.evolutionBranch ?? []) {
        if (branch.temporaryEvolution && shadow) continue;
        const suffix = branch.temporaryEvolution?.replace('TEMP_EVOLUTION_', '').toLowerCase();
        const resolved = suffix
          ? `${baseId}_${suffix}`
          : resolveGo(branch.form ?? branch.evolution ?? '');
        const to = shadow ? `${resolved}_shadow` : resolved;
        if (!ids.has(to) || to === id) {
          if (to !== id)
            audit.rejectedEdges.push({
              from: id,
              to,
              reason: 'Target is not in the supported catalog.',
            });
          continue;
        }
        const requirements = [];
        if (branch.candyCost) requirements.push(`${branch.candyCost} Candy`);
        if (branch.evolutionItemRequirement)
          requirements.push(`Item: ${pretty(branch.evolutionItemRequirement)}`);
        if (branch.genderRequirement) requirements.push(`${pretty(branch.genderRequirement)} only`);
        if (branch.onlyDaytime) requirements.push('Daytime');
        if (branch.onlyNighttime) requirements.push('Nighttime');
        if (branch.onlyDuskPeriod) requirements.push('Dusk only; Dusk-capable Rockruff required');
        if (branch.kmBuddyDistanceRequirement)
          requirements.push(`Walk ${branch.kmBuddyDistanceRequirement} km with this buddy`);
        if (branch.mustBeBuddy) requirements.push('Keep as your active buddy while evolving');
        if (branch.lureItemRequirement)
          requirements.push(`Required lure: ${pretty(branch.lureItemRequirement)}`);
        if (branch.onlyUpsideDown) requirements.push('Turn your phone upside down');
        if (branch.questDisplay?.length)
          requirements.push('Complete this copy’s evolution adventure shown in the game');
        if (branch.temporaryEvolutionEnergyCost)
          requirements.push(
            `Temporary form; initially ${branch.temporaryEvolutionEnergyCost} Energy (check current in-game cost)`,
          );
        if (baseId === 'rayquaza' && suffix)
          requirements.push('Dragon Ascent and a Meteorite required');
        const random =
          baseId === 'wurmple' ||
          (baseId === 'eevee' && ['vaporeon', 'jolteon', 'flareon'].includes(resolved));
        if (random)
          requirements.push(
            'Random branch unless an applicable one-time method remains; not guaranteed',
          );
        if (rules.evolutionAliases?.[cleanGo(branch.form ?? branch.evolution ?? '')])
          requirements.push(
            'Variants with identical battle stats share this target in the source catalog. The variant you obtain depends on this copy and the in-game evolution rules.',
          );
        const edge = {
          to,
          kind: suffix ? 'temporary' : to.startsWith('zygarde') ? 'form' : 'evolution',
          requirements,
          source: 'go-gamemaster',
          ...(branch.genderRequirement ? { gender: branch.genderRequirement.toLowerCase() } : {}),
          ...(random ? { random: true } : {}),
        };
        if (baseId === 'tyrogue') {
          edge.highestIV = { hitmonlee: 0, hitmonchan: 1, hitmontop: 2 }[resolved];
          requirements.push(
            'Branch depends on the highest IV; tied highest IVs can randomize the outcome',
          );
        }
        const existing = target.evolutions.find((e) => e.to === to);
        if (!existing) target.evolutions.push(edge);
        else if (existing.gender && edge.gender && existing.gender !== edge.gender) {
          // Pyroar's male/female forms share a battle-stat record. Either gender can reach it.
          delete existing.gender;
          existing.requirements = existing.requirements.filter((r) => !r.endsWith(' only'));
          existing.requirements.push(
            'Both genders can evolve; appearance follows the copy’s gender.',
          );
        }
      }
    if (game && !shadow && !temporary)
      for (const change of game.formChange ?? [])
        for (const form of change.availableForm ?? []) {
          const to = resolveGo(form);
          if (!ids.has(to) || to === id) continue;
          const requirements = [
            'Form change preserves this copy’s IVs; verify that the change is unlocked in the game.',
          ];
          if (change.candyCost) requirements.push(`${change.candyCost} Candy`);
          if (change.stardustCost) requirements.push(`${change.stardustCost} Stardust`);
          if (change.item)
            requirements.push(
              `${change.itemCostCount ?? ''} ${change.item === 'ITEM_BEANS' ? 'Zygarde Cells' : pretty(change.item)}`,
            );
          target.evolutions.push({ to, kind: 'form', requirements, source: 'go-gamemaster' });
        }
    species.push(target);
  }
  const byId = new Map(species.map((p) => [p.id, p]));
  // Only known event paths are shown, and only if the user explicitly includes them.
  for (const [from, to] of rules.eventEdges)
    if (byId.has(from) && byId.has(to)) {
      const p = byId.get(from);
      p.evolutions = p.evolutions.filter((e) => e.to !== to);
      p.evolutions.push({
        to,
        kind: 'evolution',
        eventOnly: true,
        requirements: [
          'Only during a specifically enabled GO evolution event. Not a normally reachable branch.',
        ],
        source: 'manual-rules',
      });
    }
  for (const { from, ...edge } of rules.extraEdges)
    if (byId.has(from) && byId.has(edge.to)) {
      const p = byId.get(from);
      p.evolutions = p.evolutions.filter((e) => e.to !== edge.to);
      p.evolutions.push(edge);
    }
  // No regular -> Shadow, Shadow -> Mega, or Nincada -> Shedinja paths are ever permitted.
  for (const p of species)
    p.evolutions = p.evolutions.filter((edge) => {
      const t = byId.get(edge.to);
      const valid =
        t &&
        t.shadow === p.shadow &&
        !(p.shadow && t.temporary) &&
        !(p.id === 'nincada' && t.id === 'shedinja');
      if (!valid)
        audit.rejectedEdges.push({
          from: p.id,
          to: edge.to,
          reason: 'Invalid Shadow, temporary-form or GO evolution relationship.',
        });
      return valid;
    });
  for (const fact of raidFacts.filter((f) => f.type !== 'normal')) {
    const id = rules.raidAliases?.[fact.name] ?? byName.get(nameKey(fact.name));
    const p = byId.get(id);
    if (!p) {
      audit.warnings.push(`Unmapped raid listing: ${fact.name} (${fact.type}).`);
      continue;
    }
    let entry = p.raid.find((r) => r.tier === 'strong');
    if (!entry) {
      entry = {
        tier: 'strong',
        types: [],
        evidence:
          'Listed in GO Hub’s top 10 for an attacking type. This is a general raid shortlist, not a boss-specific result.',
        source: 'gohub-raids',
        reviewed: retrieved.slice(0, 10),
        moves: [],
      };
      p.raid.push(entry);
    }
    if (!entry.types.includes(fact.type)) entry.types.push(fact.type);
    entry.moves.push(`${fact.type}: ${fact.moves.join(' + ')}`);
  }
  // Preserve broad CSV raid claims without promoting them to independently verified advice.
  for (const row of species) {
    const id = row.csv?.raidTargetId;
    const p = byId.get(id);
    if (p && !p.raid.length)
      p.raid.push({
        tier: row.csv.raidLabel.includes('backup') ? 'budget' : 'unverified',
        types: [],
        evidence: `Unverified CSV suggestion: ${row.csv.raidLabel}. Check moves, opponent and current alternatives.`,
        source: 'input-csv',
        reviewed: '',
      });
  }
  audit.warnings.push(
    'All CSV forms are retained. A simulator released flag does not independently verify GO availability.',
  );
  audit.warnings.push(
    'Budget raid candidates come from the input CSV and remain unverified. Missing raid evidence never means no raid value.',
  );
  audit.warnings.push(
    'Known non-tradable research Pokémon use manually reviewed minimum levels. The default IV comparison remains all 4,096 combinations, even when some IVs are unobtainable.',
  );
  audit.warnings.push(
    'GO game-master templates do not establish live release status or event overrides. Costumes and special form changes require in-game confirmation.',
  );
  return {
    schema: 1,
    version,
    retrieved,
    calculatorVersion: '1.0.0',
    sources,
    species: species.sort((a, b) => a.name.localeCompare(b.name)),
    cpm,
    counts: {
      forms: rows.length,
      dexSpecies: new Set(rows.map((r) => r['Pokédex #'])).size,
      additionalTargets: species.length - rows.length,
    },
    audit,
  };
}
export function validateCatalog(data, expectedForms) {
  if (data.schema !== 1 || !data.version || data.cpm.length < 101)
    throw new Error('Incomplete snapshot or CPM data.');
  if (
    data.counts.forms !== expectedForms ||
    data.species.filter((p) => p.csv).length !== expectedForms
  )
    throw new Error('CSV coverage changed unexpectedly.');
  const ids = new Set(data.species.map((p) => p.id));
  if (ids.size !== data.species.length) throw new Error('Duplicate normalized form IDs.');
  for (const p of data.species) {
    if (p.baseStats && !Object.values(p.baseStats).every((n) => Number.isFinite(n) && n > 0))
      throw new Error(`Bad stats: ${p.id}`);
    for (const edge of p.evolutions)
      if (!ids.has(edge.to)) throw new Error(`Dangling edge: ${p.id} -> ${edge.to}`);
    for (const r of Object.values(p.rankings))
      if (!Number.isInteger(r.rank) || r.rank < 1) throw new Error(`Bad ranking: ${p.id}`);
  }
  if (!(data.cpm[98] > 0.84 && data.cpm[100] > data.cpm[98]))
    throw new Error('Invalid level 50/51 CP multipliers.');
  return true;
}
