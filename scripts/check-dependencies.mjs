import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const installed = {
  react: require('react/package.json').version,
  'react-dom': require('react-dom/package.json').version,
};
const locked = {
  react: lock.packages?.['node_modules/react']?.version,
  'react-dom': lock.packages?.['node_modules/react-dom']?.version,
};

for (const [label, versions] of Object.entries({ lockfile: locked, installed })) {
  if (!versions.react || !versions['react-dom'] || versions.react !== versions['react-dom']) {
    console.error(
      'React version mismatch in ' +
        label +
        ': react@' +
        versions.react +
        ' and react-dom@' +
        versions['react-dom'] +
        '. Both must have the exact same version. ' +
        'Update both packages together, commit package-lock.json, then run npm ci.',
    );
    process.exit(1);
  }
}

if (installed.react !== locked.react) {
  console.error(
    'Installed React packages differ from package-lock.json. Run npm ci before building.',
  );
  process.exit(1);
}
console.log('React runtime compatibility verified: react and react-dom @ ' + installed.react);
