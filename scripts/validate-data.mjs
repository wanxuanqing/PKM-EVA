import { readFile } from 'node:fs/promises';
import { hash, parseCatalog, validateCatalog } from './data-lib.mjs';
const pointer = JSON.parse(await readFile('src/data/current.json', 'utf8'));
const raw = await readFile(`public${pointer.file}`);
if (hash(raw) !== pointer.sha256) throw new Error('Catalog checksum mismatch.');
const data = JSON.parse(raw);
const rows = parseCatalog(await readFile('Pokemon_GO_full_alphabetical_catalog_2026-09-27.csv'));
validateCatalog(data, rows.length);
console.log(
  `Validated ${data.counts.forms} CSV forms, ${data.counts.dexSpecies} species, ${data.species.length} total supported forms; snapshot ${data.version}.`,
);
