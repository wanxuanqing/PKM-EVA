import artwork from '../data/artwork-forms.json';
import type { Species } from '../types';
type ArtworkEntry = { url: string | null; kind?: string; reason?: string; source: string };
export function pokemonArtwork(species: Pick<Species, 'id' | 'dex'>) {
  const id = species.id.replace(/_shadow$/, '');
  const entry = (artwork.forms as Record<string, ArtworkEntry>)[id];
  // Never silently substitute a base image for an unaudited named form.
  if (entry) return { ...entry, mapped: true };
  if (id.includes('_')) return { url: null, mapped: true, kind: undefined };
  return {
    url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${species.dex}.png`,
    mapped: false,
    kind: 'artwork',
  };
}
