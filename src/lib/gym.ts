import type { Species } from '../types';

export const gymSource = 'https://db.pokemongohub.net/best/gym-defenders';
export const gymReviewed = '2026-10-02';
// Exact regular-form allowlist: never inherit ratings for Shadows or temporary forms.
export const gymTiers: Record<string, 'S' | 'A+'> = {
  blissey: 'S',
  chansey: 'S',
  snorlax: 'A+',
  dondozo: 'A+',
  umbreon: 'A+',
  avalugg: 'A+',
  avalugg_hisuian: 'A+',
  melmetal: 'A+',
  ursaluna: 'A+',
  goodra: 'A+',
  mandibuzz: 'A+',
  steelix: 'A+',
  lapras: 'A+',
  coalossal: 'A+',
  garganacl: 'A+',
  rhyperior: 'A+',
  milotic: 'A+',
  slaking: 'A+',
  tyranitar: 'A+',
  garchomp: 'A+',
  relicanth: 'A+',
  kingambit: 'A+',
  hippowdon: 'A+',
  florges: 'A+',
  vaporeon: 'A+',
};
export function gymTier(species: Species) {
  return species.shadow || species.temporary ? undefined : gymTiers[species.id];
}
