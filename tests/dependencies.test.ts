import { it, expect } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function check(
  installedReact: string,
  installedDom: string,
  lockedReact = installedReact,
  lockedDom = installedDom,
) {
  mkdirSync('.work', { recursive: true });
  const root = mkdtempSync(resolve('.work/react-compatibility-'));
  mkdirSync(join(root, 'scripts'));
  copyFileSync('scripts/check-dependencies.mjs', join(root, 'scripts/check-dependencies.mjs'));
  for (const [name, version] of [
    ['react', installedReact],
    ['react-dom', installedDom],
  ]) {
    const dir = join(root, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }));
  }
  writeFileSync(
    join(root, 'package-lock.json'),
    JSON.stringify({
      packages: {
        'node_modules/react': { version: lockedReact },
        'node_modules/react-dom': { version: lockedDom },
      },
    }),
  );
  return spawnSync(process.execPath, [join(root, 'scripts/check-dependencies.mjs')], {
    encoding: 'utf8',
  });
}

it('allows matching installed and locked React runtimes', () => {
  const result = check('19.3.1', '19.3.1');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('compatibility verified');
});

it('rejects the patch mismatch that otherwise crashes the app at startup', () => {
  const result = check('19.3.1', '19.3.0', '19.3.1', '19.3.1');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('mismatch in installed');
  expect(result.stderr).toContain('react@19.3.1 and react-dom@19.3.0');
});

it('rejects a mismatched lockfile even when the local runtime pair matches', () => {
  const result = check('19.3.1', '19.3.1', '19.3.1', '19.3.0');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('mismatch in lockfile');
});

it('requires reinstalling when matching local runtimes are older than the lockfile', () => {
  const result = check('19.3.0', '19.3.0', '19.3.1', '19.3.1');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Run npm ci');
});
