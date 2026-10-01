import { readFile, writeFile, mkdir, rename, copyFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildMovesheet, movesheetCSV } from './movesheet.mjs';
import {
  hash,
  parseCatalog,
  extractRaidFacts,
  normalizeData,
  validateCatalog,
} from './data-lib.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const offline = process.argv.includes('--offline');
const bootstrap = process.argv.includes('--bootstrap');
const paths = [
  'src/data/gamemaster.json',
  'src/data/rankings/all/overall/rankings-1500.json',
  'src/data/rankings/all/overall/rankings-2500.json',
  'src/data/rankings/all/overall/rankings-10000.json',
  'src/js/pokemon/Pokemon.js',
  'LICENSE',
];
async function get(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'PKM-EVA-data-updater' },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Source fetch failed (${response.status}): ${url}`);
  return response.text();
}
async function fetchRepo(repo, files) {
  const info = JSON.parse(await get(`https://api.github.com/repos/${repo}`));
  const commit = JSON.parse(
    await get(`https://api.github.com/repos/${repo}/commits/${info.default_branch}`),
  );
  const contents = await Promise.all(
    files.map(async (path) => [
      path,
      await get(`https://raw.githubusercontent.com/${repo}/${commit.sha}/${path}`),
    ]),
  );
  return {
    commit: commit.sha,
    date: commit.commit.committer.date,
    files: Object.fromEntries(contents),
  };
}
await mkdir('data/raw', { recursive: true });
await mkdir('public/data', { recursive: true });
await mkdir('src/data', { recursive: true });
await mkdir('docs', { recursive: true });
let bundle;
if (offline) {
  const pointer = JSON.parse(await readFile('data/sources-current.json', 'utf8'));
  const compressed = await readFile(pointer.file);
  if (hash(compressed) !== pointer.sha256) throw new Error('Raw snapshot checksum mismatch.');
  bundle = JSON.parse(gunzipSync(compressed).toString('utf8'));
} else if (bootstrap) {
  const pc = JSON.parse(await readFile('.work/sources/pvpoke-commit.json', 'utf8'));
  const gc = JSON.parse(await readFile('.work/sources/game_masters-commit.json', 'utf8'));
  const files = Object.fromEntries(
    await Promise.all(
      paths.map(async (p) => [
        p,
        await readFile(`.work/sources/pvpoke-${p.replaceAll('/', '_')}`, 'utf8'),
      ]),
    ),
  );
  bundle = {
    retrieved: new Date().toISOString(),
    pvpoke: { commit: pc.sha, date: pc.commit.committer.date, files },
    go: {
      commit: gc.sha,
      date: gc.commit.committer.date,
      files: {
        'latest/latest.json': await readFile(
          '.work/sources/game_masters-latest_latest.json',
          'utf8',
        ),
      },
    },
    raidFacts: extractRaidFacts(await readFile('.work/sources/raid.html', 'utf8')),
  };
} else {
  const [pvpoke, go, raidHTML] = await Promise.all([
    fetchRepo('pvpoke/pvpoke', paths),
    fetchRepo('PokeMiners/game_masters', ['latest/latest.json']),
    get('https://db.pokemongohub.net/best/attackers-per-type'),
  ]);
  bundle = {
    retrieved: new Date().toISOString(),
    pvpoke,
    go,
    raidFacts: extractRaidFacts(raidHTML),
  };
}
const csvFile = 'Pokemon_GO_full_alphabetical_catalog_2026-09-27.csv';
const csv = await readFile(csvFile);
const rules = JSON.parse(await readFile('data/manual-rules.json', 'utf8'));
const rows = parseCatalog(csv);
const gm = JSON.parse(bundle.pvpoke.files['src/data/gamemaster.json']);
const go = JSON.parse(bundle.go.files['latest/latest.json']);
const match = bundle.pvpoke.files['src/js/pokemon/Pokemon.js'].match(/var cpms = (\[[^;]+\]);/);
if (!match) throw new Error('CP multiplier source schema changed; review required.');
const cpm = JSON.parse(match[1]).slice(0, 101);
const rankings = Object.fromEntries(
  [
    ['GL', 1500],
    ['UL', 2500],
    ['ML', 10000],
  ].map(([league, cap]) => [
    league,
    JSON.parse(bundle.pvpoke.files[`src/data/rankings/all/overall/rankings-${cap}.json`]),
  ]),
);
const sources = [
  {
    id: 'input-csv',
    name: 'Original user catalog',
    url: csvFile,
    retrieved: bundle.retrieved,
    date: '2026-09-27',
    files: [{ path: csvFile, sha256: hash(csv) }],
  },
  {
    id: 'pvpoke',
    name: 'PvPoke · open overall GL / UL / ML',
    url: `https://github.com/pvpoke/pvpoke/tree/${bundle.pvpoke.commit}`,
    commit: bundle.pvpoke.commit,
    date: bundle.pvpoke.date,
    retrieved: bundle.retrieved,
    license: 'MIT',
    files: paths.map((path) => ({ path, sha256: hash(bundle.pvpoke.files[path]) })),
  },
  {
    id: 'go-gamemaster',
    name: 'GO game-master templates · PokeMiners',
    url: `https://github.com/PokeMiners/game_masters/tree/${bundle.go.commit}`,
    commit: bundle.go.commit,
    date: bundle.go.date,
    retrieved: bundle.go.retrieved ?? bundle.retrieved,
    license: 'Game data; upstream does not supply a code license for these game facts.',
    files: [{ path: 'latest/latest.json', sha256: hash(bundle.go.files['latest/latest.json']) }],
  },
  {
    id: 'gohub-raids',
    name: 'GO Hub · top 10 attackers per type',
    url: 'https://db.pokemongohub.net/best/attackers-per-type',
    retrieved: bundle.retrieved,
    files: [
      { path: 'normalized raid listing facts', sha256: hash(JSON.stringify(bundle.raidFacts)) },
    ],
  },
  {
    id: 'manual-rules',
    name: 'Reviewed exceptions and conservative evolution rules',
    url: 'data/manual-rules.json',
    retrieved: bundle.retrieved,
    date: rules.version,
  },
];
if (bundle.raidPages?.length)
  sources.push({
    id: 'gohub-moves',
    name: 'GO Hub · exact-form raid moves and type-role ratings',
    url: 'https://db.pokemongohub.net/',
    retrieved: bundle.retrieved,
    files: bundle.raidPages.map((p) => ({ path: p.url, sha256: p.sha256 })),
  });
const normalizerHash = hash(
  Buffer.concat([
    await readFile('scripts/data-lib.mjs'),
    await readFile('scripts/movesheet.mjs'),
    await readFile('scripts/update-data.mjs'),
  ]),
);
const version = `${bundle.retrieved.slice(0, 10)}-${hash(JSON.stringify({ bundle, rules, csv: hash(csv), normalizerHash, schema: 1 })).slice(0, 12)}`;
let previous;
if (bundle.movesAudit?.previousCatalog) {
  const oldBytes = await readFile(`public${bundle.movesAudit.previousCatalog.file}`);
  if (hash(oldBytes) !== bundle.movesAudit.previousCatalog.sha256)
    throw new Error('Previous catalog checksum mismatch');
  previous = JSON.parse(oldBytes);
}
const data = normalizeData({
  gm,
  go,
  rankings,
  rows,
  cpm,
  rules,
  raidFacts: bundle.raidFacts,
  raidPages: bundle.raidPages,
  retainedSpecies: previous?.species,
  retrieved: bundle.retrieved,
  sources,
  version,
});
const movesheet = buildMovesheet(data, bundle, previous);
const sheetFile = `/data/moves-${version}`;
data.movesheet = { json: `${sheetFile}.json`, csv: `${sheetFile}.csv`, ...movesheet.counts };
await writeFile(`public${sheetFile}.json`, JSON.stringify(movesheet, null, 2) + '\n');
await writeFile(`public${sheetFile}.csv`, movesheetCSV(movesheet));
validateCatalog(data, rows.length);
// Validate everything before publishing a new pointer. Existing valid snapshots are immutable.
const catalogFile = `public/data/catalog-${version}.json`;
const json = JSON.stringify(data);
await writeFile(`${catalogFile}.tmp`, json);
await rename(`${catalogFile}.tmp`, catalogFile);
const compressed = gzipSync(JSON.stringify(bundle), { level: 9 });
const rawFile = `data/raw/sources-${hash(compressed).slice(0, 12)}.json.gz`;
await writeFile(rawFile, compressed);
await writeFile(
  'data/sources-current.json',
  JSON.stringify({ file: rawFile, sha256: hash(compressed) }, null, 2) + '\n',
);
await writeFile('public/PVPOKE-LICENSE.txt', bundle.pvpoke.files.LICENSE);
await copyFile(csvFile, `data/raw/${csvFile}`);
await writeFile(`data/audit-${version}.json`, JSON.stringify(data.audit, null, 2) + '\n');
await writeFile(
  'src/data/current.json.tmp',
  JSON.stringify({ version, file: `/data/catalog-${version}.json`, sha256: hash(json) }, null, 2) +
    '\n',
);
await rename('src/data/current.json.tmp', 'src/data/current.json');
console.log(JSON.stringify({ version, ...data.counts, audit: data.audit }, null, 2));
