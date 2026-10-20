import { it, expect } from 'vitest';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-expect-error The controlled Node import step is plain JavaScript, not browser code.
import { parseCatalog, validateCatalog } from '../scripts/data-lib.mjs';
import pointer from '../src/data/current.json';
import type { Catalog } from '../src/types';
const headers = [
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
it('preserves sourced minimum levels independently of the comparison IV floor', () => {
  const data = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8'));
  for (const id of ['deoxys', 'deoxys_attack', 'deoxys_defense', 'deoxys_speed']) {
    const form = data.species.find((p: { id: string }) => p.id === id);
    expect(form.minLevel).toBe(20);
    expect(form.tradable).toBe(false);
  }
  expect(data.species.find((p: { id: string }) => p.id === 'mew').minLevel).toBe(15);
});
it('imports BOM, quoted commas, escaped quotes, CRLF and Unicode without rewriting the input', () => {
  const text =
    '\uFEFF' +
    headers.join(',') +
    '\r\n"Flabébé, \"\"flower\"\"",669,flabebe,Unverified,"GL, Collection",Florges #10,,,\r\n';
  const rows = parseCatalog(text);
  expect(rows[0]['Pokémon / form']).toBe('Flabébé, "flower"');
  expect(rows[0]['Best uses']).toBe('GL, Collection');
});
it('rejects malformed headers, duplicate stable IDs and bad Pokédex values', () => {
  expect(() => parseCatalog('name,id\na,b')).toThrow();
  const row = 'Duskull,355,duskull,Available in GO,GL,Dusclops #76,,,\n';
  expect(() => parseCatalog(headers.join(',') + '\n' + row + row)).toThrow('Duplicate');
  expect(() => parseCatalog(headers.join(',') + '\n' + row.replace('355', 'abc'))).toThrow(
    'Pokédex',
  );
});
it('rejects missing CP multipliers and dangling evolution targets', () => {
  const data = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8'));
  expect(validateCatalog(data, 1608)).toBe(true);
  expect(() => validateCatalog({ ...data, cpm: [] }, 1608)).toThrow();
  data.species[0].evolutions.push({ to: 'missing-form' });
  expect(() => validateCatalog(data, 1608)).toThrow('Dangling');
});
it('failed offline updates preserve the last valid published pointer', () => {
  mkdirSync('.work', { recursive: true });
  const fixture = mkdtempSync(resolve('.work/import-failure-'));
  for (const folder of ['scripts', 'data', 'src/data'])
    mkdirSync(join(fixture, folder), { recursive: true });
  for (const file of ['update-data.mjs', 'data-lib.mjs', 'movesheet.mjs'])
    copyFileSync(`scripts/${file}`, join(fixture, 'scripts', file));
  const before = JSON.stringify({ version: 'previous-valid', file: '/data/previous-valid.json' });
  writeFileSync(join(fixture, 'src/data/current.json'), before);
  writeFileSync(join(fixture, 'data/broken.gz'), 'corrupt snapshot');
  writeFileSync(
    join(fixture, 'data/sources-current.json'),
    JSON.stringify({ file: 'data/broken.gz', sha256: 'does-not-match' }),
  );
  const result = spawnSync(process.execPath, ['scripts/update-data.mjs', '--offline'], {
    cwd: fixture,
    encoding: 'utf8',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('checksum mismatch');
  expect(readFileSync(join(fixture, 'src/data/current.json'), 'utf8')).toBe(before);
});

it('rejects a useful Mega raid target with a missing regular-form connection', () => {
  const data = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8'));
  const base = data.species.find((p: { id: string }) => p.id === 'staraptor');
  base.evolutions = base.evolutions.filter((e: { to: string }) => e.to !== 'staraptor_mega');
  expect(() => validateCatalog(data, 1608)).toThrow('Missing Mega/Primal raid path');
});

it('preserves new debut forms and their distinct GO evolution rules', () => {
  const data = JSON.parse(readFileSync('public' + pointer.file, 'utf8')) as Catalog;
  const byId = new Map(data.species.map((p) => [p.id, p]));
  for (const form of ['phony', 'antique']) {
    const baby = byId.get('sinistea_' + form)!,
      adult = byId.get('polteageist_' + form)!;
    expect(baby.gender!.allowed).toEqual(['genderless']);
    expect(baby.baseStats).toEqual(byId.get('sinistea')!.baseStats);
    expect(adult.baseStats).toEqual(byId.get('polteageist')!.baseStats);
    expect(baby.evolutions).toHaveLength(1);
    expect(baby.evolutions[0]).toMatchObject({
      to: adult.id,
      requirements: [form === 'phony' ? '50 Candy' : '400 Candy'],
    });
    expect(adult.raid[0].moveSets).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'ghost', tier: 'A' })]),
    );
    expect(adult.rankings).toEqual({});
  }
  expect(byId.get('sinistea')!.evolutions[0]).toMatchObject({ review: true });
  expect(byId.get('sinistea')!.evolutions[0].requirements.join(' ')).toContain('400 Candy');
  expect(byId.get('bramblin')!.evolutions).toEqual([
    expect.objectContaining({
      to: 'brambleghast',
      requirements: ['50 Candy', 'Walk 20 km with Bramblin as your buddy'],
      source: 'https://db.pokemongohub.net/pokemon/946',
    }),
  ]);
  expect(byId.get('minior_meteor')!.baseStats).toEqual({ atk: 116, def: 194, hp: 155 });
  expect(byId.get('minior_core')!.baseStats).toEqual({ atk: 218, def: 131, hp: 155 });
  for (const id of ['minior_meteor', 'minior_core']) {
    expect(byId.get(id)!.evolutions).toEqual([]);
    expect(byId.get(id)!.rankings).toEqual({});
    expect(byId.get(id)!.notes.join(' ')).toContain('not an ordinary evolution');
  }
});
