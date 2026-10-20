import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { hash } from './data-lib.mjs';
import { extractTypeRankings, matchRaidForm, goodRaidTier } from './moves-lib.mjs';

const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));
const pointer = await readJSON('src/data/current.json');
const catalog = await readJSON(`public${pointer.file}`);
const rules = await readJSON('data/manual-rules.json');
const rawPointer = await readJSON('data/sources-current.json');
const compressed = await readFile(rawPointer.file);
if (hash(compressed) !== rawPointer.sha256) throw new Error('Source checksum mismatch');
const bundle = JSON.parse(gunzipSync(compressed));
const previousRetrieved = bundle.retrieved;
await mkdir('.work/moves/pages', { recursive: true });
const retrieved = new Date().toISOString();
async function get(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'PKM-EVA moves verification' },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`${r.status}: ${url}`);
  return r.text();
}
// Resume interrupted runs from explicit local source captures, not from browser state.
async function page(url) {
  const path = `.work/moves/pages/${hash(url).slice(0, 16)}.json`;
  if (process.argv.includes('--resume')) {
    try {
      const cached = await readJSON(path);
      if (cached.url === url && Date.now() - Date.parse(cached.retrieved) < 86400000) return cached;
    } catch {}
  }
  const html = await get(url);
  const record = { url, retrieved: new Date().toISOString(), sha256: hash(html), html };
  await writeFile(path, JSON.stringify(record));
  return record;
}
async function batches(items, worker) {
  for (let i = 0; i < items.length; i += 3) {
    const results = await Promise.allSettled(items.slice(i, i + 3).map(worker));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
    console.log(`Checked ${Math.min(i + 3, items.length)}/${items.length}`);
  }
}
if (!process.argv.includes('--raids-only')) {
  const head = JSON.parse(await get('https://api.github.com/repos/pvpoke/pvpoke/commits/master'));
  const files = {};
  await batches(Object.keys(bundle.pvpoke.files), async (path) => {
    files[path] = await get(`https://raw.githubusercontent.com/pvpoke/pvpoke/${head.sha}/${path}`);
  });
  bundle.pvpoke = { commit: head.sha, date: head.commit.committer.date, retrieved, files };
}
bundle.pvpoke.retrieved ??= previousRetrieved;
bundle.go.retrieved ??= previousRetrieved;

const supplementals = (rules.raidSupplementalForms ?? []).map(({ id, baseId }) => {
  const base = catalog.species.find((p) => p.id === baseId);
  if (!base || !id.endsWith('_shadow') || id.replace(/_shadow$/, '') !== baseId)
    throw new Error(`Invalid raid supplement ${id}`);
  return { ...base, id, name: `${base.name} (Shadow)`, shadow: true, baseId };
});
const roster = [
  ...catalog.species,
  ...(rules.battleFormVariants ?? [])
    .filter((f) => !catalog.species.some((p) => p.id === f.id))
    .map((f) => {
      const base = catalog.species.find((p) => p.id === f.baseId);
      if (!base) throw new Error('Missing variant base: ' + f.baseId);
      return { ...base, id: f.id, name: f.name };
    }),
  ...supplementals.filter((p) => !catalog.species.some((s) => s.id === p.id)),
];
const types = [
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
const captures = [];
await batches(types, async (type) => {
  const p = await page(`https://db.pokemongohub.net/pokemon-list/best-per-type/${type}`);
  captures.push({
    type,
    url: p.url,
    retrieved: p.retrieved,
    sha256: p.sha256,
    rows: extractTypeRankings(p.html, type),
  });
});
captures.sort((a, b) => a.type.localeCompare(b.type));
const byForm = new Map();
const unmapped = [];
let qualifyingRoles = 0;
for (const capture of captures)
  for (const row of capture.rows) {
    const p = matchRaidForm(row, roster, rules.raidAliases ?? {});
    if (goodRaidTier(row.tier)) qualifyingRoles++;
    if (!p) {
      if (goodRaidTier(row.tier))
        unmapped.push({
          name: row.attacker.name,
          dex: row.attacker.id,
          form: row.attacker.form,
          type: capture.type,
          tier: row.tier,
          reason: 'No exact supported form match',
        });
      continue;
    }
    let record = byForm.get(p.id);
    if (!record) {
      record = {
        id: p.id,
        name: p.name,
        url: capture.url,
        retrieved: capture.retrieved,
        roles: [],
      };
      byForm.set(p.id, record);
    }
    record.roles.push({
      type: capture.type,
      tier: row.tier,
      rank: row.order,
      moves: [row.qm, row.cm].map((m) => ({
        name: m.name,
        limited: !!m.isLegacy,
        url: `https://db.pokemongohub.net/move/${m.id}`,
      })),
      source: capture.url,
      retrieved: capture.retrieved,
      offType: ![row.attacker.type1, row.attacker.type2].includes(capture.type),
      mixedMoves: row.qm.type !== capture.type || row.cm.type !== capture.type,
      conditions: [
        ...(p.temporary
          ? [
              'GO Hub default Mega benchmark uses Super Max Level (1.3x, +2 levels); your copy may perform differently.',
            ]
          : []),
        ...(/[+]$/.test(row.qm.name) || /[+]$/.test(row.cm.name)
          ? ['+ moves are available while Mega Evolved and get stronger with Mega Level.']
          : []),
      ],
    });
  }
// Retain old captures as audit evidence; full per-type captures define current advice.
bundle.previousRaidPages ??= bundle.raidPages;
bundle.raidPages = [...byForm.values()].sort((a, b) => a.id.localeCompare(b.id));
bundle.raidTypeRankings = captures;
bundle.raidForms = supplementals
  .filter((p) => byForm.has(p.id))
  .map(({ id, baseId, name, dex }) => ({ id, baseId, name, dex }));
bundle.retrieved = retrieved;
bundle.raidFacts = captures.flatMap((c) =>
  c.rows
    .filter((r) => r.order <= 10)
    .map((r) => ({
      type: c.type,
      rank: r.order,
      name: r.attacker.name,
      moves: [r.qm, r.cm].map((m) => m.name + (m.isLegacy ? ' *' : '')),
    })),
);
bundle.movesAudit = {
  retrieved,
  previousCatalog: pointer,
  unmapped,
  qualifyingRoles,
  matchedQualifyingRoles: bundle.raidPages.reduce(
    (n, p) => n + p.roles.filter((r) => goodRaidTier(r.tier)).length,
    0,
  ),
  policy:
    'GO Hub SS/S/A tiers qualify (legacy S+/A+ supported); full non-Normal type lists, exact forms, mixed/off-type roles labeled. Mega defaults and + moves require the documented unlocks.',
};
if (unmapped.length) throw new Error(`Unmapped SS/S/A forms: ${JSON.stringify(unmapped)}`);
const output = gzipSync(JSON.stringify(bundle), { level: 9 });
const file = `data/raw/sources-${hash(output).slice(0, 12)}.json.gz`;
await writeFile(file, output);
await writeFile(
  'data/sources-current.json',
  JSON.stringify({ file, sha256: hash(output) }, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    { pvpoke: bundle.pvpoke.commit, raidPages: bundle.raidPages.length, qualifyingRoles, unmapped },
    null,
    2,
  ),
);
console.log(
  'Source capture complete. Run npm run data:update -- --offline to validate and publish the app snapshot.',
);
