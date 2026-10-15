import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { hash } from './data-lib.mjs';
import { extractMaxSupport, buildMaxSupport } from './max-support-lib.mjs';
const json = async (p) => JSON.parse(await readFile(p, 'utf8'));
const pointer = await json('data/sources-current.json'),
  compressed = await readFile(pointer.file);
if (hash(compressed) !== pointer.sha256) throw new Error('Source checksum mismatch');
const bundle = JSON.parse(gunzipSync(compressed));
const current = await json('src/data/current.json'),
  catalog = await json('public' + current.file),
  rules = await json('data/manual-rules.json');
if (!bundle.maxBattleRankings) throw new Error('Capture Max attackers before support tiers');
const offline = process.argv.includes('--offline');
await mkdir('.work/max-support', { recursive: true });
const captures = [];
for (const [role, url] of [
  ['Defender', 'https://pokemongohub.net/post/guide/max-defenders-tier-list/'],
  ['Healer', 'https://pokemongohub.net/post/guide/max-healers-tier-list-june-2025/'],
]) {
  let html, retrieved;
  if (offline) {
    const saved = bundle.maxSupportCaptures?.find((c) => c.role === role);
    if (!saved || hash(saved.html) !== saved.sha256)
      throw new Error('Missing or corrupt offline support capture: ' + role);
    html = saved.html;
    retrieved = saved.retrieved;
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(response.status + ': ' + url);
    html = await response.text();
    retrieved = new Date().toISOString();
    await writeFile('.work/max-support/' + role + '.html', html);
  }
  captures.push({
    role,
    url,
    retrieved,
    sha256: hash(html),
    html,
    ...extractMaxSupport(html, role),
  });
}
const entries = buildMaxSupport(
  captures,
  bundle.maxBattleRankings.captures,
  catalog,
  JSON.parse(bundle.pvpoke.files['src/data/gamemaster.json']),
  rules,
);
const savedArtwork = new Map(
  [
    ...bundle.maxBattleRankings.entries,
    ...(bundle.maxBattleRankings.usefulEntries ?? []),
    ...(bundle.maxBattleRankings.supportEntries ?? []),
  ].map((e) => [e.id, e.artwork]),
);
for (const entry of entries) {
  if (savedArtwork.get(entry.id)) entry.artwork = savedArtwork.get(entry.id);
  else if (entry.mode === 'Gigantamax')
    throw new Error('Missing matching Gigantamax artwork: ' + entry.name);
}
bundle.maxBattleRankings.supportEntries = entries;
bundle.maxSupportCaptures = captures;
bundle.retrieved = [bundle.retrieved, ...captures.map((c) => c.retrieved)].sort().at(-1);
const output = gzipSync(JSON.stringify(bundle), { level: 9 }),
  file = 'data/raw/sources-' + hash(output).slice(0, 12) + '.json.gz';
await writeFile(file, output);
await writeFile(
  'data/sources-current.json.tmp',
  JSON.stringify({ file, sha256: hash(output) }, null, 2) + '\n',
);
await rename('data/sources-current.json.tmp', 'data/sources-current.json');
console.log(
  JSON.stringify(
    {
      forms: entries.length,
      roles: captures.map((c) => ({
        role: c.role,
        species: c.rows.filter((r) => ['SS', 'S+', 'S', 'A+', 'A'].includes(r.tier)).length,
        forms: entries.filter((e) => e.support.some((r) => r.role === c.role)).length,
        retrieved: c.retrieved,
      })),
    },
    null,
    2,
  ),
);
