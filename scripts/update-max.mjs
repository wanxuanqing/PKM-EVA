import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { hash, nameKey } from './data-lib.mjs';
import { extractMaxRankings } from './moves-lib.mjs';
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const pointer = await json('src/data/current.json'),
  catalog = await json(`public${pointer.file}`),
  rules = await json('data/manual-rules.json');
const rawPointer = await json('data/sources-current.json'),
  compressed = await readFile(rawPointer.file);
if (hash(compressed) !== rawPointer.sha256) throw new Error('Source checksum mismatch');
const bundle = JSON.parse(gunzipSync(compressed)),
  retrieved = process.argv.includes('--offline')
    ? bundle.maxBattleRankings.retrieved
    : new Date().toISOString();
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
await mkdir('.work/max-battles', { recursive: true });
const offline = process.argv.includes('--offline');
const captures = offline ? bundle.maxBattleRankings.captures : [];
let next = 0;
if (!offline)
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < types.length) {
        const type = types[next++],
          url = `https://db.pokemongohub.net/pokemon-list/best-dynamax-per-type/${type}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw new Error(`${response.status}: ${url}`);
        const html = await response.text();
        const rows = extractMaxRankings(html, type);
        captures.push({ type, url, retrieved: new Date().toISOString(), sha256: hash(html), rows });
        await writeFile(`.work/max-battles/${type}.html`, html);
      }
    }),
  );
captures.sort((a, b) => a.type.localeCompare(b.type));
const entries = new Map();
const byType = [];
for (const capture of captures) {
  const selected = capture.rows.slice(0, 5);
  byType.push({
    type: capture.type,
    available: capture.rows.length,
    selected: selected.length,
    source: capture.url,
  });
  for (const row of capture.rows.filter(
    (r) => r.order <= 5 || ['SS', 'S+', 'S', 'A+', 'A'].includes(r.tier),
  )) {
    const explicit = rules.maxAliases?.[row.attacker.name];
    const ordinaryName = row.attacker.name
      .replace(/^(Dynamax|Gigantamax)\s+/, '')
      .replace(/\bStyle\b/g, '');
    const candidates = catalog.species.filter(
      (p) =>
        !p.shadow &&
        !p.temporary &&
        p.dex === row.attacker.id &&
        (explicit ? p.id === explicit : nameKey(p.name) === nameKey(ordinaryName)),
    );
    if (candidates.length !== 1) throw new Error(`Unmapped Max form: ${row.attacker.name}`);
    const base = candidates[0];
    const form = row.attacker.form ?? 'Special';
    const id = `${base.id}:max:${form.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const mode = /Gigantamax/.test(form)
      ? 'Gigantamax'
      : /Dynamax/.test(form)
        ? 'Dynamax'
        : 'Special';
    let entry = entries.get(id);
    if (!entry) {
      entry = {
        id,
        speciesId: base.id,
        dex: base.dex,
        name: row.attacker.name,
        form,
        mode,
        roles: [],
      };
      entries.set(id, entry);
    }
    entry.roles.push({
      type: capture.type,
      rank: row.order,
      tier: row.tier,
      damage: row.dynamax.maxMoveDamage,
      fast: {
        name: row.qm.name,
        limited: !!row.qm.isLegacy,
        url: `https://db.pokemongohub.net/move/${row.qm.id}`,
      },
      maxMove: {
        name: row.cm.name,
        limited: !!row.cm.isLegacy,
        url: `https://db.pokemongohub.net/move/${row.cm.id}`,
      },
      source: capture.url,
      retrieved: capture.retrieved,
    });
  }
}
// Gigantamax needs its own artwork; do not substitute an ordinary appearance.
for (const entry of entries.values()) {
  let slug;
  if (entry.mode === 'Gigantamax')
    slug =
      entry.dex === 849 ? 'toxtricity-amped-gmax' : entry.speciesId.replaceAll('_', '-') + '-gmax';
  else if (entry.dex === 849)
    slug = /Low Key/.test(entry.form) ? 'toxtricity-low-key' : 'toxtricity-amped';
  if (!slug) continue;
  if (offline) {
    const saved = bundle.maxBattleRankings.entries.find((e) => e.id === entry.id)?.artwork;
    if (!saved) throw new Error('Offline artwork mapping missing: ' + entry.name);
    entry.artwork = saved;
    continue;
  }
  const source = `https://pokeapi.co/api/v2/pokemon/${slug}`,
    response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (response.status === 404) {
    entry.artwork = { url: null, source };
    continue;
  }
  if (!response.ok) throw new Error(`${response.status}: ${source}`);
  const data = await response.json();
  if (Number(data.species.url.split('/').filter(Boolean).at(-1)) !== entry.dex)
    throw new Error(`Artwork species mismatch: ${entry.name}`);
  const url = data.sprites.other?.['official-artwork']?.front_default ?? null;
  if (url) {
    if (!url.startsWith('https://raw.githubusercontent.com/PokeAPI/sprites/'))
      throw new Error('Unexpected artwork host');
    const check = await fetch(url, { method: 'HEAD' });
    if (!check.ok) throw new Error(`Missing artwork: ${url}`);
  }
  entry.artwork = { url, source, kind: 'artwork' };
}
bundle.maxBattleRankings = {
  ...bundle.maxBattleRankings,
  retrieved,
  benchmark:
    'GO Hub default level-50 Max Attack damage benchmark. Actual damage depends on boss, level and Max Move upgrades; these rankings do not rate tanking or healing.',
  byType,
  entries: [...entries.values()]
    .map((e) => ({ ...e, roles: e.roles.filter((r) => r.rank <= 5) }))
    .filter((e) => e.roles.length)
    .sort((a, b) => a.name.localeCompare(b.name)),
  usefulEntries: [...entries.values()]
    .map((e) => ({
      ...e,
      roles: e.roles.filter((r) => ['SS', 'S+', 'S', 'A+', 'A'].includes(r.tier)),
    }))
    .filter((e) => e.roles.length)
    .sort((a, b) => a.name.localeCompare(b.name)),
  captures,
};
bundle.retrieved = [bundle.retrieved, retrieved].sort().at(-1);
const output = gzipSync(JSON.stringify(bundle), { level: 9 }),
  file = `data/raw/sources-${hash(output).slice(0, 12)}.json.gz`;
await writeFile(file, output);
await writeFile(
  'data/sources-current.json.tmp',
  JSON.stringify({ file, sha256: hash(output) }, null, 2) + '\n',
);
await rename('data/sources-current.json.tmp', 'data/sources-current.json');
console.log(
  JSON.stringify(
    {
      topFiveForms: bundle.maxBattleRankings.entries.length,
      topFiveRoles: bundle.maxBattleRankings.entries.flatMap((e) => e.roles).length,
      usefulForms: bundle.maxBattleRankings.usefulEntries.length,
      usefulRoles: bundle.maxBattleRankings.usefulEntries.flatMap((e) => e.roles).length,
      byType,
    },
    null,
    2,
  ),
);
