export function buildMovesheet(data, bundle, previous) {
  const old = new Map((previous?.species ?? []).map((p) => [p.id, p]));
  const gm = JSON.parse(bundle.pvpoke.files['src/data/gamemaster.json']);
  const pokemon = new Map(gm.pokemon.map((p) => [p.speciesId, p]));
  const moves = new Map(gm.moves.map((m) => [m.moveId, m]));
  const rows = [];
  const counts = {
    pvp: 0,
    pvpChanged: 0,
    pvpNew: 0,
    pvpExcluded: 0,
    raidIncluded: 0,
    raidExcluded: 0,
    raidFormsWithMoves: 0,
    raidFormsMissingMoves: 0,
  };
  for (const [league, cap] of [
    ['GL', 1500],
    ['UL', 2500],
    ['ML', 10000],
  ]) {
    const raw = JSON.parse(
      bundle.pvpoke.files[`src/data/rankings/all/overall/rankings-${cap}.json`],
    );
    const rankings = new Map(raw.map((r, i) => [r.speciesId, { ...r, rank: i + 1 }]));
    for (const p of data.species.filter(
      (s) => s.eligible[league] && s.rankings[league]?.rank < 200,
    )) {
      const ranking = rankings.get(p.id);
      const sourcePokemon = pokemon.get(p.id);
      const selected = ranking.moveset.map((id, i) => {
        if (
          !(i === 0 ? sourcePokemon.fastMoves : sourcePokemon.chargedMoves).includes(id) ||
          !moves.has(id)
        )
          throw new Error(
            `${p.id} ${league}: PvPoke recommendation conflicts with its move pool: ${id}`,
          );
        return {
          id,
          name: moves.get(id).name,
          elite: (sourcePokemon.eliteMoves ?? []).includes(id),
          legacy: (sourcePokemon.legacyMoves ?? []).includes(id),
        };
      });
      if (
        selected.length !== p.rankings[league].moves.length ||
        selected.some((m, i) => m.name !== p.rankings[league].moves[i].name)
      )
        throw new Error(`${p.id} ${league}: app moves do not match PvPoke`);
      const before = old.get(p.id)?.rankings[league];
      const comparison = !before
        ? 'new'
        : JSON.stringify(before.moves) === JSON.stringify(p.rankings[league].moves)
          ? 'unchanged'
          : 'updated';
      counts.pvp++;
      if (comparison === 'updated') counts.pvpChanged++;
      if (comparison === 'new') counts.pvpNew++;
      rows.push({
        id: p.id,
        name: p.name,
        shadow: p.shadow,
        gender: p.gender?.fixed ?? '',
        role: league,
        attackingType: '',
        rank: ranking.rank,
        previousRank: before?.rank ?? null,
        tier: '',
        includedInApp: true,
        verification: 'Matched pinned PvPoke recommendation and exact-form move pool',
        comparison,
        moves: selected,
        previousMoves: before?.moves ?? [],
        source: `https://github.com/pvpoke/pvpoke/blob/${bundle.pvpoke.commit}/src/data/rankings/all/overall/rankings-${cap}.json`,
        retrieved: bundle.pvpoke.retrieved ?? bundle.retrieved,
      });
    }
  }
  const pages = new Map((bundle.raidPages ?? []).map((p) => [p.id, p]));
  for (const p of previous?.species ?? [])
    for (const league of ['GL', 'UL', 'ML']) {
      const before = p.rankings[league];
      if (!p.eligible[league] || !before || before.rank >= 200) continue;
      const current = data.species.find((s) => s.id === p.id);
      const after = current?.rankings[league];
      if (current?.eligible[league] && after?.rank < 200) continue;
      counts.pvpExcluded++;
      const cap = { GL: 1500, UL: 2500, ML: 10000 }[league];
      rows.push({
        id: p.id,
        name: p.name,
        shadow: p.shadow,
        gender: p.gender?.fixed ?? '',
        role: league,
        attackingType: '',
        rank: after?.rank ?? null,
        previousRank: before.rank,
        tier: '',
        includedInApp: false,
        verification: 'No longer meets current top-199 eligibility',
        comparison: 'no longer qualifying',
        moves: after?.moves ?? [],
        previousMoves: before.moves,
        source: `https://github.com/pvpoke/pvpoke/blob/${bundle.pvpoke.commit}/src/data/rankings/all/overall/rankings-${cap}.json`,
        retrieved: bundle.pvpoke.retrieved ?? bundle.retrieved,
      });
    }
  for (const p of data.species.filter((p) => p.raid.length)) {
    const page = pages.get(p.id);
    if (p.raid.some((r) => r.moves?.length)) counts.raidFormsWithMoves++;
    else counts.raidFormsMissingMoves++;
    if (page)
      for (const role of page.roles) {
        const included = p.raid.some((r) => r.moveSets?.some((m) => m.type === role.type));
        if (included) counts.raidIncluded++;
        else counts.raidExcluded++;
        rows.push({
          id: p.id,
          name: p.name,
          shadow: p.shadow,
          gender: p.gender?.fixed ?? '',
          role: 'Raid',
          attackingType: role.type,
          rank: role.rank,
          tier: role.tier,
          includedInApp: included,
          verification: 'Exact-form GO Hub role recommendation',
          comparison: included
            ? 'sourced'
            : role.type === 'normal'
              ? 'Normal role excluded by app policy'
              : 'Below B-tier expansion cutoff',
          moves: role.moves,
          previousMoves: old.get(p.id)?.raid.flatMap((r) => r.moves ?? []) ?? [],
          source: page.url,
          retrieved: page.retrieved,
        });
      }
    // Keep every app recommendation represented, including shortlist-only sources and unresolved CSV candidates.
    for (const raid of p.raid.filter((r) => !r.moveSets?.length)) {
      const entries = raid.moves?.length ? raid.moves : [''];
      for (const text of entries) {
        const match = /^([^:]+): (.+) \+ (.+)$/.exec(text);
        const selected = match
          ? match.slice(2).map((name) => ({
              name: name.replace(/\s*[*†]/g, '').trim(),
              limited: /[*†]/.test(name),
            }))
          : [];
        rows.push({
          id: p.id,
          name: p.name,
          shadow: p.shadow,
          gender: p.gender?.fixed ?? '',
          role: 'Raid',
          attackingType: match?.[1] ?? '',
          rank: null,
          tier: raid.tier,
          includedInApp: true,
          verification: selected.length
            ? 'GO Hub type shortlist'
            : 'No qualifying sourced raid role',
          comparison: selected.length ? 'sourced' : 'unverified',
          moves: selected,
          previousMoves: old.get(p.id)?.raid.flatMap((r) => r.moves ?? []) ?? [],
          source:
            raid.source === 'gohub-raids'
              ? 'https://db.pokemongohub.net/best/attackers-per-type'
              : raid.source,
          retrieved: raid.reviewed,
        });
      }
    }
  }
  return {
    schema: 1,
    catalogVersion: data.version,
    retrieved: bundle.retrieved,
    pvpokeCommit: bundle.pvpoke.commit,
    policy: bundle.movesAudit?.policy ?? 'Existing sourced recommendations',
    counts,
    exceptions: bundle.movesAudit?.unmapped ?? [],
    rows,
  };
}

export function movesheetCSV(sheet) {
  const columns = [
    'id',
    'name',
    'shadow',
    'gender',
    'role',
    'attackingType',
    'rank',
    'previousRank',
    'tier',
    'includedInApp',
    'fastMove',
    'chargedMove1',
    'chargedMove2',
    'limitedMoves',
    'verification',
    'comparison',
    'previousMoves',
    'source',
    'retrieved',
  ];
  const quote = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  return (
    [
      columns,
      ...sheet.rows.map((r) => {
        const flat = {
          ...r,
          fastMove: r.moves[0]?.name,
          chargedMove1: r.moves[1]?.name,
          chargedMove2: r.moves[2]?.name,
          limitedMoves: r.moves
            .filter((m) => m.elite || m.legacy || m.limited)
            .map((m) => m.name)
            .join('; '),
          previousMoves: r.previousMoves
            .map((m) => (typeof m === 'string' ? m : m.name))
            .join('; '),
        };
        return columns.map((c) => flat[c]);
      }),
    ]
      .map((row) => row.map(quote).join(','))
      .join('\r\n') + '\r\n'
  );
}
