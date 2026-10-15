import { load } from 'cheerio';
import { nameKey } from './data-lib.mjs';
export const goodSupportTier = (tier) => ['SS', 'S+', 'S', 'A+', 'A'].includes(tier);
export function extractMaxSupport(html, role) {
  const $ = load(html);
  if (
    !['Defender', 'Healer'].includes(role) ||
    !$('h1')
      .first()
      .text()
      .includes('Max ' + role + 's Tier List')
  )
    throw new Error('Wrong Max support source: ' + role);
  const rows = [];
  const tiers = new Set();
  $('h2').each((_, h) => {
    const tier = $(h)
      .text()
      .trim()
      .match(/^(SS|S[+]?|A[+]?|B[+]?|C[+]?|D|E|F) Tier$/)?.[1];
    if (!tier) return;
    tiers.add(tier);
    $(h)
      .nextUntil('h2')
      .find('tbody tr')
      .each((_, tr) => {
        const cells = $(tr).find('td');
        const link = cells.first().find('a[href*="db.pokemongohub.net/pokemon/"]').first();
        const url = link.attr('href');
        const name = link.find('.name').text().trim() || link.text().trim();
        const dex = Number(url?.match(/\/pokemon\/(\d+)/)?.[1]);
        if (!name || !dex) throw new Error('Unidentified ' + role + ' row');
        const fastMoves =
          role === 'Defender'
            ? cells
                .eq(1)
                .find('li')
                .first()
                .text()
                .split('/')
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        if (role === 'Defender' && !fastMoves.length)
          throw new Error('Missing defender moves: ' + name);
        const resistances = cells
          .eq(1)
          .find('img[alt$="type icon"]')
          .toArray()
          .map((e) =>
            $(e)
              .attr('alt')
              .replace(/ type icon$/, '')
              .toLowerCase(),
          );
        rows.push({ name, dex, tier, fastMoves, resistances, url });
      });
  });
  if (
    !tiers.has('S') ||
    !tiers.has('A') ||
    !rows.some((r) => r.tier === 'S') ||
    !rows.some((r) => r.tier === 'A') ||
    new Set(rows.map((r) => r.url)).size !== rows.length
  )
    throw new Error('Incomplete or duplicate Max support source');
  return { rows, updated: $('meta[property="article:modified_time"]').attr('content') ?? null };
}
export function maxBase(attacker, catalog, rules) {
  const ordinary = attacker.name.replace(/^(Dynamax|Gigantamax)\s+/, '').replace(/\bStyle\b/g, '');
  const explicit = rules.maxAliases?.[attacker.name];
  const candidates = catalog.species.filter(
    (p) =>
      !p.shadow &&
      !p.temporary &&
      p.dex === attacker.id &&
      (explicit ? p.id === explicit : nameKey(p.name) === nameKey(ordinary)),
  );
  if (candidates.length !== 1) throw new Error('Unmapped Max form: ' + attacker.name);
  return candidates[0];
}
export function buildMaxSupport(captures, attackCaptures, catalog, gm, rules) {
  const roster = [
    ...new Map(
      attackCaptures.flatMap((c) => c.rows).map((r) => [r.attacker.name, r.attacker]),
    ).values(),
  ];
  const entries = new Map();
  for (const capture of captures)
    for (const row of capture.rows.filter((r) => goodSupportTier(r.tier))) {
      const forms = roster.filter(
        (a) =>
          a.id === row.dex &&
          nameKey(a.name.replace(/^(Dynamax|Gigantamax)\s+/, '')) === nameKey(row.name),
      );
      if (!forms.length) throw new Error('No sourced Max capability: ' + row.name);
      for (const attacker of forms) {
        const base = maxBase(attacker, catalog, rules);
        const form = attacker.form ?? 'Special';
        const id = base.id + ':max:' + form.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        let entry = entries.get(id);
        if (!entry) {
          entry = {
            id,
            speciesId: base.id,
            dex: base.dex,
            name: attacker.name,
            form,
            mode: /Gigantamax/.test(form)
              ? 'Gigantamax'
              : /Dynamax/.test(form)
                ? 'Dynamax'
                : 'Special',
            roles: [],
            support: [],
          };
          entries.set(id, entry);
        }
        const pokemon = gm.pokemon.find((p) => p.speciesId === base.id);
        const fastMoves = row.fastMoves.map((name) => {
          const move = gm.moves.find((m) => nameKey(m.name) === nameKey(name));
          const verified = !!move && !!pokemon?.fastMoves.includes(move.moveId);
          return {
            name,
            verified,
            limited: verified && !!pokemon.eliteMoves?.includes(move.moveId),
            legacy: verified && !!pokemon.legacyMoves?.includes(move.moveId),
          };
        });
        entry.support.push({
          role: capture.role,
          tier: row.tier,
          fastMoves,
          resistances: row.resistances,
          source: capture.url,
          retrieved: capture.retrieved,
          updated: capture.updated,
          notes:
            capture.role === 'Defender'
              ? [
                  'General defender / charger tier. The best choice depends on the boss and its moves.',
                  'Use the recommended fast move to charge the Max Meter. Unlock and level Max Guard when using this copy to tank during the Max phase.',
                ]
              : [
                  'General healer tier based on HP and long-term usefulness; not a boss-specific simulation.',
                  'Unlock and level Max Spirit. The healer tier does not require a particular Fast or Charged Attack.',
                ],
        });
      }
    }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}
