import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import pointer from '../src/data/current.json';
import type { Catalog } from '../src/types';
import { pokemonArtwork, setCatalogArtwork } from '../src/lib/artwork';
const catalog = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8')) as Catalog;
setCatalogArtwork(catalog.artwork);
it('every named catalog entry has an explicit artwork decision, including unavailable forms', () => {
  expect(catalog.artwork?.forms).toBeDefined();
  for (const p of catalog.species) {
    const id = p.id.replace(/_shadow$/, '');
    if (id.includes('_')) expect(catalog.artwork!.forms, id).toHaveProperty(id);
  }
});
it('maps distinct alternate forms and preserves regional identity for Shadows', () => {
  for (const [id, filename] of Object.entries({
    shaymin_land: '492',
    shaymin_sky: '10006',
    deoxys_attack: '10001',
    giratina_origin: '10007',
    rotom_wash: '10009',
    charizard_mega_x: '10034',
    charizard_mega_y: '10035',
    meowstic_female: '10025',
    avalugg_hisuian_shadow: '10243',
    burmy_sandy: '412-sandy',
    genesect_burn: '649-burn',
  }))
    expect(pokemonArtwork({ id, dex: 0 }).url, id).toMatch(new RegExp(`/${filename}\\.png$`));
});
it('does not substitute standard artwork for missing or newly introduced forms', () => {
  expect(pokemonArtwork({ id: 'mewtwo_armored', dex: 150 }).url).toBeNull();
  expect(pokemonArtwork({ id: 'shaymin_future', dex: 492 }).url).toBeNull();
  expect(pokemonArtwork({ id: 'duskull_shadow', dex: 355 }).url).toMatch(/\/355\.png$/);
});
