# Gym Defense

Reviewed 2026-10-02 against [GO Hub's defender list](https://db.pokemongohub.net/best/gym-defenders). The exact allowlist is in `src/lib/gym.ts`; source date is shown on cards and About/Data. Refresh this list manually when reviewing gym rankings; `moves:update` does not change it.

S: Blissey, Chansey.

A+: Snorlax, Dondozo, Umbreon, Avalugg, Hisuian Avalugg, Melmetal, Ursaluna, Goodra, Mandibuzz, Steelix, Lapras, Coalossal, Garganacl, Rhyperior, Milotic, Slaking, Tyranitar, Garchomp, Relicanth, Kingambit, Hippowdon, Florges, Vaporeon.

Exact regular-form IDs prevent accidental inheritance by Shadows, costumes, Mega/Primal forms or other alternate forms. Melmetal is deliberately included in this gym shortlist; do not apply a blanket exclusion based on mythical classification. This is not a general eligibility validator for every species.

All 25 shortlisted forms have `isDeployable: true` in the bundled PokeMiners game-master snapshot at commit `8e227be44f288d34463e23bf04e9b564d3c16f79`, including Hisuian Avalugg and Melmetal. Florges color templates agree. This is template evidence, not a guarantee that a particular copy can enter a particular gym.

Recent release references checked during implementation:

- [Dondozo](https://pokemongo.com/news/sunkissed-shores-2025?hl=en)
- [Kingambit](https://pokemongo.com/news/crown-clash-2025)
- [Garganacl evolution line](https://pokemongo.com/es/news/journey-to-paldea-2025)
- [Coalossal evolution line](https://pokemongo.com/news/winter-holiday-part2-2025)

The source ranks species by base Defense × Stamina. It does not simulate moves, typing, motivation decay, attackers, or gym activity. No gym IV percentile or best-IV calculation is invented, and raid/PvP thresholds do not gate gym value. An unconditional supported gym path yields Keep even for low IVs; a conditional-only useful path yields Review. Existing collection protections remain higher priority.

Keep means consider retaining a defender, not invest in every copy. Placement depends on the actual copy, a friendly gym with room and no duplicate species, and current game rules. See [official gym guidance](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/83-battling-at-gyms/). Existing graph requirements and conditional flags are retained, and unsupported evolution edges are not invented. This addition does not certify every historical release claim in the catalog or reproduce the source's full database.
