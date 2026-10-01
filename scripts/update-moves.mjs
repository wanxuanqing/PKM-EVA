import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { hash, nameKey, extractRaidFacts } from './data-lib.mjs';
import { pokemonLinks, extractPokemonMoves } from './moves-lib.mjs';

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
const head = JSON.parse(await get('https://api.github.com/repos/pvpoke/pvpoke/commits/master'));
const paths = Object.keys(bundle.pvpoke.files);
const files = {};
await batches(paths, async (path) => {
  files[path] = await get(`https://raw.githubusercontent.com/pvpoke/pvpoke/${head.sha}/${path}`);
});
const top = await page('https://db.pokemongohub.net/best/attackers-per-type');
const links = new Map(pokemonLinks(top.html).map((l) => [nameKey(l.name), l]));
const candidates = catalog.species.filter((s) => s.raid.length);
const unmapped = [];
// Base species pages provide exact regional/Mega/Shadow form links.
const dexes = [...new Set(candidates.filter((s) => !links.has(nameKey(s.name))).map((s) => s.dex))];
await batches(dexes, async (dex) => {
  const p = await page(`https://db.pokemongohub.net/pokemon/${dex}`);
  for (const l of pokemonLinks(p.html)) links.set(nameKey(l.name), l);
});
const raidPages = [];
await batches(candidates, async (species) => {
  // The upstream duplicate has no independently verified form mapping.
  if (species.id === 'golisopodsh') {
    unmapped.push({ id: species.id, reason: 'Ambiguous simulator duplicate' });
    return;
  }
  const sourceAlias = Object.entries(rules.raidAliases ?? {}).find(
    ([, id]) => id === species.id,
  )?.[0];
  const match =
    links.get(nameKey(species.name)) ?? (sourceAlias ? links.get(nameKey(sourceAlias)) : undefined);
  if (!match) {
    unmapped.push({ id: species.id, reason: 'No exact GO Hub form match' });
    return;
  }
  const p = await page(match.url);
  const extracted = extractPokemonMoves(p.html, match.name);
  raidPages.push({
    id: species.id,
    ...extracted,
    url: p.url,
    retrieved: p.retrieved,
    sha256: p.sha256,
  });
});
bundle.pvpoke = { commit: head.sha, date: head.commit.committer.date, retrieved, files };
bundle.go.retrieved ??= previousRetrieved;
bundle.retrieved = retrieved;
bundle.raidFacts = extractRaidFacts(top.html);
bundle.raidPages = raidPages.sort((a, b) => a.id.localeCompare(b.id));
bundle.movesAudit = {
  retrieved,
  previousCatalog: pointer,
  unmapped,
  policy:
    'GO Hub tiers B or better qualify for expanded general raid roles; Normal roles remain excluded. Exact form matches only.',
};
const output = gzipSync(JSON.stringify(bundle), { level: 9 });
const file = `data/raw/sources-${hash(output).slice(0, 12)}.json.gz`;
await writeFile(file, output);
await writeFile(
  'data/sources-current.json',
  JSON.stringify({ file, sha256: hash(output) }, null, 2) + '\n',
);
console.log(JSON.stringify({ pvpoke: head.sha, raidPages: raidPages.length, unmapped }, null, 2));
console.log(
  'Source capture complete. Run npm run data:update -- --offline to validate and publish the app snapshot.',
);
