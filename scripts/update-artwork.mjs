import { readFile, writeFile } from 'node:fs/promises';
const pointer = JSON.parse(await readFile('src/data/current.json', 'utf8'));
const catalog = JSON.parse(await readFile(`public${pointer.file}`, 'utf8'));
const aliases = {
  necrozma_dusk_mane: 'necrozma-dusk',
  necrozma_dawn_wings: 'necrozma-dawn',
  cherrim_sunny: 'cherrim-sunshine',
  nidoran_female: 'nidoran-f',
  nidoran_male: 'nidoran-m',
  morpeko_full_belly: 'morpeko-full-belly',
  rockruff_dusk: 'rockruff-own-tempo',
  tauros_aqua: 'tauros-paldea-aqua-breed',
  tauros_blaze: 'tauros-paldea-blaze-breed',
  tauros_combat: 'tauros-paldea-combat-breed',
  zacian_hero: 'zacian',
  zacian_crowned_sword: 'zacian-crowned',
  zamazenta_hero: 'zamazenta',
  zamazenta_crowned_shield: 'zamazenta-crowned',
  zygarde_10: 'zygarde-10',
};
async function get(url) {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}
const entries = catalog.species.filter((p) => !p.shadow && p.id.includes('_'));
const forms = {};
let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < entries.length) {
      const p = entries[next++];
      const slug =
        aliases[p.id] ??
        p.id
          .replace(/alolan/g, 'alola')
          .replace(/galarian/g, 'galar')
          .replace(/hisuian/g, 'hisui')
          .replace(/paldean/g, 'paldea')
          .replaceAll('_', '-');
      let source = `https://pokeapi.co/api/v2/pokemon/${slug}`;
      let data = await get(source);
      let url = data?.sprites.other?.['official-artwork']?.front_default;
      let kind = 'artwork';
      if (data && Number(data.species.url.split('/').filter(Boolean).at(-1)) !== p.dex)
        throw new Error(`Species mismatch: ${p.id}`);
      if (!url) {
        source = `https://pokeapi.co/api/v2/pokemon-form/${slug}`;
        data = await get(source);
        url = data?.sprites.front_default;
        kind = 'sprite';
        if (url) {
          const parent = await get(data.pokemon.url);
          if (Number(parent.species.url.split('/').filter(Boolean).at(-1)) !== p.dex)
            throw new Error(`Form mismatch: ${p.id}`);
        }
      }
      if (url) {
        if (!url.startsWith('https://raw.githubusercontent.com/PokeAPI/sprites/'))
          throw new Error(`Unexpected host: ${url}`);
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) throw new Error(`Missing image: ${url}`);
        forms[p.id] = { id: data.id, url, kind, source };
      } else {
        forms[p.id] = {
          url: null,
          reason: 'No matching artwork or form sprite available from PokéAPI.',
          source,
        };
      }
    }
  }),
);
await writeFile(
  'src/data/artwork-forms.json',
  JSON.stringify(
    {
      reviewed: new Date().toISOString().slice(0, 10),
      forms: Object.fromEntries(Object.entries(forms).sort(([a], [b]) => a.localeCompare(b))),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Audited ${entries.length} named entries. Images: ${Object.values(forms).filter((p) => p.url).length}. Unavailable:`,
  Object.entries(forms)
    .filter(([, p]) => !p.url)
    .map(([id]) => id),
);
