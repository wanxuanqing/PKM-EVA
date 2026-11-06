import type { Species } from '../types';

export const gymSource = 'https://db.pokemongohub.net/best/gym-defenders';
export const gymReviewed = '2026-11-05';
// Exact regular-form allowlist: never inherit ratings for Shadows or temporary forms.
export const gymTiers: Record<string, 'SS' | 'S' | 'A'> = {
  blissey: 'SS',
  chansey: 'S',
  snorlax: 'S',
  dondozo: 'S',
  umbreon: 'A',
  avalugg: 'A',
  avalugg_hisuian: 'A',
  melmetal: 'A',
  ursaluna: 'A',
  goodra: 'A',
  mandibuzz: 'A',
  steelix: 'A',
  lapras: 'A',
  coalossal: 'A',
  garganacl: 'A',
  rhyperior: 'A',
  milotic: 'A',
  slaking: 'A',
};
export function gymTier(species: Species) {
  return species.shadow || species.temporary ? undefined : gymTiers[species.id];
}
