import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { reachable } from '../src/lib/assessment.ts';

const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pointer = readJSON('src/data/current.json');
const bytes = readFileSync(`public${pointer.file}`);
if (hash(bytes) !== pointer.sha256) throw new Error('Catalog checksum mismatch');
const data = JSON.parse(bytes);
const rawPointer = readJSON('data/sources-current.json');
const raw = readFileSync(rawPointer.file);
if (hash(raw) !== rawPointer.sha256) throw new Error('Source checksum mismatch');
const bundle = JSON.parse(gunzipSync(raw));
const go = JSON.parse(bundle.go.files['latest/latest.json']);
const templates = new Map(go.map((t) => [t.templateId, t]));
const byId = new Map(data.species.map((p) => [p.id, p]));
const settings = {
  maxLevel: 50,
  bestBuddy: false,
  floor: 0,
  threshold: 95,
  gender: 'unknown',
  eventPaths: true,
};
const failures = [];
let traversals = 0;
const entries = data.species.map((p) => {
  const metadata = p.gender;
  const sourceGenders = new Set();
  for (const id of metadata?.templates ?? []) {
    const template = templates.get(id);
    const settings = template?.data?.genderSettings;
    if (!settings || Number(/^SPAWN_V(\d+)_/.exec(id)?.[1]) !== p.dex) {
      failures.push(`${p.id}: missing or wrong-species source ${id}`);
      continue;
    }
    for (const [key, value] of Object.entries(settings.gender))
      if (value > 0) sourceGenders.add(key.replace('Percent', ''));
  }
  if (JSON.stringify([...sourceGenders].sort()) !== JSON.stringify(metadata?.allowed))
    failures.push(`${p.id}: allowed genders do not match source evidence`);
  if ((metadata?.allowed.length === 1 ? metadata.allowed[0] : null) !== metadata?.fixed)
    failures.push(`${p.id}: incorrect fixed-gender flag`);
  if (
    metadata?.inheritedFrom &&
    JSON.stringify(metadata.allowed) !==
      JSON.stringify(byId.get(metadata.inheritedFrom)?.gender?.allowed)
  )
    failures.push(`${p.id}: temporary form differs from its base gender`);
  if (
    p.shadow &&
    JSON.stringify(metadata?.allowed) !==
      JSON.stringify(byId.get(p.id.replace(/_shadow$/, ''))?.gender?.allowed)
  )
    failures.push(`${p.id}: Shadow differs from regular gender`);
  // Exercise every copy gender and IV-dependent branch, including event routes.
  for (const gender of metadata?.allowed ?? []) {
    for (const ivs of [
      [15, 14, 13],
      [13, 15, 14],
      [13, 14, 15],
      [15, 15, 15],
    ]) {
      traversals++;
      for (const result of reachable(p, byId, { ...settings, gender }, ivs)) {
        const allowed = result.species.gender?.allowed;
        if (allowed?.length && !allowed.includes(gender))
          failures.push(`${p.id} (${gender}) reaches incompatible ${result.species.id}`);
        for (let i = 1; i < result.path.length; i++) {
          const edges = byId
            .get(result.path[i - 1])
            .evolutions.filter((e) => e.to === result.path[i]);
          if (edges.every((e) => e.gender && e.gender !== gender))
            failures.push(`${p.id} (${gender}) violates evolution gender at ${result.path[i]}`);
        }
      }
    }
  }
  return {
    id: p.id,
    name: p.name,
    dex: p.dex,
    ...metadata,
    status: sourceGenders.size ? 'source-backed' : 'unverified',
  };
});
const report = {
  snapshot: data.version,
  sourceCommit: bundle.go.commit,
  scope:
    'Bundled GO gender templates, form mappings, Shadow/base agreement and all supported evolution paths; not a live availability audit.',
  total: entries.length,
  sourceBacked: entries.filter((p) => p.status === 'source-backed').length,
  unverified: entries.filter((p) => p.status === 'unverified').map((p) => p.id),
  inheritedTemporaryForms: entries.filter((p) => p.inheritedFrom).length,
  traversals,
  failures: [...new Set(failures)],
  entries,
};
writeFileSync('docs/gender-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, entries: undefined }, null, 2));
if (failures.length) process.exitCode = 1;
