import type { ArtworkData, ArtworkEntry, Species } from '../types';
let activeArtwork: Record<string, ArtworkEntry> = {};
export function setCatalogArtwork(data?: ArtworkData) {
  activeArtwork = data?.forms ?? {};
}
export function pokemonArtwork(
  species: Pick<Species, 'id' | 'dex'>,
  forms: Record<string, ArtworkEntry> = activeArtwork,
) {
  const id = species.id.replace(/_shadow$/, '');
  const entry = forms[id];
  // Never silently substitute a base image for an unaudited named form.
  if (entry) return { ...entry, mapped: true };
  if (id.includes('_')) return { url: null, mapped: true, kind: undefined };
  return {
    url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${species.dex}.png`,
    mapped: false,
    kind: 'artwork',
  };
}
