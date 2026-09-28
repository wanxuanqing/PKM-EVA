import { readFile, writeFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { distribution, assessIVs } from '../src/lib/calculator.ts';
import { hash } from './data-lib.mjs';
const commit = '8e580166c8a4bbe1995a55a673d930265ef0321b';
const expectedHashes = {
  'calculate.js': '04e5d8c9ce0102fc06d51240ae41cd020cdbd212d382940d6a5b73c3fde53ea5',
  'pokeListObj.js': '220fa01ce4143b0b2dbfe129285c9d590ba8891f352cdf9836f254eef3ad8424',
};
await mkdir('.work/sources', { recursive: true });
const files = {};
for (const file of ['calculate.js', 'pokeListObj.js']) {
  const local = `.work/sources/reference-${file}`;
  try {
    files[file] = await readFile(local, 'utf8');
  } catch {
    const r = await fetch(
      `https://raw.githubusercontent.com/DeathbyToast/PvP_IVs/${commit}/includes/${file}`,
    );
    if (!r.ok) throw new Error(`Reference download failed: ${r.status}`);
    files[file] = await r.text();
    await writeFile(local, files[file]);
  }
  assert.equal(hash(files[file]), expectedHashes[file], `${file}: pinned reference checksum`);
}
const pointer = JSON.parse(await readFile('src/data/current.json', 'utf8'));
const data = JSON.parse(await readFile(`public${pointer.file}`, 'utf8'));
// Run the unmodified reference in an isolated context without filesystem/network/process bindings.
const reference = vm.createContext({ perfTiming: false, console: { log() {}, error() {} } });
vm.runInContext(files['calculate.js'], reference, { timeout: 1000 });
vm.runInContext(files['pokeListObj.js'], reference, { timeout: 1000 });
const cases = [
  ['dusclops', 'Dusclops', 'GL', 50, 0, [1, 12, 13]],
  ['dusknoir', 'Dusknoir', 'UL', 50, 0, [1, 12, 13]],
  ['dusknoir', 'Dusknoir', 'UL', 51, 0, [1, 12, 13]],
  ['azumarill', 'Azumarill', 'GL', 50, 0, [0, 15, 15]],
  ['medicham', 'Medicham', 'GL', 50, 0, [5, 15, 15]],
  ['charizard', 'Charizard', 'UL', 50, 10, [10, 14, 15]],
  ['mewtwo', 'Mewtwo', 'ML', 50, 0, [15, 15, 14]],
  ['bulbasaur', 'Bulbasaur', 'GL', 1, 0, [0, 0, 0]],
];
const results = [];
let checked = 0;
for (const [id, refId, league, maxLevel, floor, ivs] of cases) {
  const p = data.species.find((p) => p.id === id);
  const stats = reference.pokeListObj[refId].split(',').slice(1, 4).map(Number);
  assert.deepEqual(
    stats,
    [p.baseStats.atk, p.baseStats.def, p.baseStats.hp],
    `${id}: independent base stats`,
  );
  const input = { base: p.baseStats, league, maxLevel, floor, minLevel: 1, cpm: data.cpm };
  reference.args = [
    ...stats,
    floor,
    1,
    maxLevel,
    false,
    league === 'GL' ? 1500 : league === 'UL' ? 2500 : 0,
    refId,
  ];
  const output = vm.runInContext('calculate(...args)', reference, { timeout: 10000 });
  const flat = Object.entries(output)
    .filter(([k]) => /^\d/.test(k))
    .flatMap(([, v]) => v);
  const dist = distribution(input);
  assert.equal(dist.poolSize, output.numRanks);
  const mine = new Map(dist.spreads.map((s) => [s.ivs.join('/'), s]));
  for (const s of flat) {
    const own = mine.get([s.IVs.A, s.IVs.D, s.IVs.S].join('/'));
    assert.equal(own.cp, s.CP);
    assert.equal(own.level, s.L);
    assert.equal(own.hp, s.battle.S);
    assert.ok(Math.abs(own.atk - s.battle.A) < 1e-10);
    assert.ok(Math.abs(own.def - s.battle.D) < 1e-10);
    checked++;
  }
  const own = assessIVs(input, ivs, dist);
  const nativeRank =
    flat.findIndex((x) => [x.IVs.A, x.IVs.D, x.IVs.S].join('/') === ivs.join('/')) + 1;
  results.push({
    id,
    league,
    maxLevel,
    minLevel: 1,
    floor,
    ivs,
    poolSize: dist.poolSize,
    rank: own.rank,
    referenceNativeRank: nativeRank,
    percentile: own.percentile,
    cp: own.stats.cp,
    level: own.stats.level,
    idealIVs: dist.ideals.map((x) => x.ivs),
    allBattleStatsMatch: true,
  });
}
const report = {
  date: new Date().toISOString(),
  snapshot: data.version,
  reference: {
    name: 'PvPIVs.com',
    url: 'https://pvpivs.com',
    commit,
    repository: `https://github.com/DeathbyToast/PvP_IVs/tree/${commit}`,
    files: Object.entries(files).map(([name, content]) => ({ name, sha256: hash(content) })),
  },
  spreadsChecked: checked,
  results,
  caveat:
    'PvPIVs rounds stat product to integers and breaks ties using Attack/HP/CP. PKM-EVA uses unrounded products (stable 1e-6 comparison) and shared competition ranks. Native reference rank can therefore differ on ties. CP, level, Attack, Defense and HP are checked for every spread in all listed cases. This validates calculations, not current release status or battle outcomes.',
};
await writeFile('docs/independent-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
