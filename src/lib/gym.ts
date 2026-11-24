import type { GymDefenseData, GymDefenseTier, Species } from '../types';

export const defaultGymSource = 'https://db.pokemongohub.net/best/gym-defenders';
export function gymMeta(gymDefense?: GymDefenseData) {
  return {
    source: gymDefense?.source ?? defaultGymSource,
    reviewed: gymDefense?.reviewed ?? '',
    tiers: gymDefense?.tiers ?? {},
  };
}
// Exact regular-form allowlist: never inherit ratings for Shadows or temporary forms.
export function gymTier(species: Species, gymDefense?: GymDefenseData): GymDefenseTier | undefined {
  return species.shadow || species.temporary ? undefined : gymDefense?.tiers[species.id];
}
