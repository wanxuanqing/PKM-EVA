# Database refresh - November 21, 2026

Updated from `2026-11-15-c6124cdf73ae` to `2026-11-22-ab3f5f543851`. The review date is November 21 in Los Angeles; snapshot filenames use the UTC capture date, November 22.

| Coverage                                               |          Before |           After |
| ------------------------------------------------------ | --------------: | --------------: |
| Catalog forms / distinct Pokedex species               |     1,637 / 959 |     1,637 / 959 |
| GL / UL / ML top-100 recommendations                   | 100 / 100 / 100 | 100 / 100 / 100 |
| Qualifying raid forms / type roles                     |       243 / 361 |       243 / 361 |
| Useful-path Max attackers / type roles                 |         67 / 87 |         67 / 87 |
| Top-five-per-type Max attackers after A filter / roles |         60 / 72 |         60 / 72 |
| Max support forms / roles                              |         20 / 21 |         20 / 21 |
| Gym defenders                                          |              18 |              18 |

All previous catalog IDs and all 1,608 original CSV forms are retained. Existing base stats, CP multipliers, IV calculations and recommendation cutoffs are unchanged. This refresh adds current rankings and moves, rather than additional catalog forms.

## PvP changes

| League | Enter top 100                                                                                | Leave top 100                                                                 | Current top-100 forms whose rank changed |
| ------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------: |
| GL     | Dunsparce (#102 to #20); Ursaluna (Shadow) (#265 to #82)                                     | Snorlax (#24 to #105); Wigglytuff (#100 to #101)                              |                                       73 |
| UL     | Charizard (#102 to #96); Kingambit (#185 to #98)                                             | Genesect (Shock) (#97 to #101); Lickilicky (#100 to #108)                     |                                       57 |
| ML     | Hippowdon (#107 to #97); Landorus (Incarnate) (Shadow) (#102 to #98); Swampert (#108 to #92) | Kommo-o (#100 to #113); Snorlax (#92 to #104); Zamazenta (Hero) (#97 to #109) |                                       94 |

Notable move changes:

- Dunsparce: Rollout replaces Bite in GL.
- Kingambit: Kowtow Cleave replaces Foul Play in UL and ML, retaining PvPoke's limited/Elite move flag. The [official November 21 Community Day announcement](https://pokemongo.com/news/communityday-november-2026-pawniard) confirms the event-evolution move. The event's temporary evolution requirement is not made permanent in the app.
- Shadow Golisopod: Shadow Claw replaces Fury Cutter in ML.
- Latios and Shadow Latios: Dragon Claw replaces Luster Purge in ML.
- Shadow Salamence's two charged recommendations only swap display order; its recommended move pair is unchanged.

Hisuian Sliggoo now has exact-form GL #836 and UL #831 rankings; Hisuian Goodra has GL #454, UL #178 and ML #180 rankings. All remain outside the top-100 recommendation cutoff. Removed the outdated unranked notes and updated the regression check to compare each regional form with its own pinned PvPoke row, including absence where that league has no row. Regular-form ranks are never substituted. The verified 100-Goomy-Candy Hisuian evolution and separate artwork are preserved.

## Raids, Max Battles, gym defense and releases

Fresh GO Hub captures leave qualifying raid, Max attacker, Max support and gym recommendations unchanged, including their tiers and recommended moves. Support coverage remains 9 defender forms and 12 healer forms across 20 distinct forms. The separate gym review retains the same 18 SS/S/A entries.

The [Dynamax Trails announcement](https://pokemongo.com/news/dynamax-trails-eternamax-eternatus-2026) describes returning species and Eternatus. Eternamax Eternatus cannot be caught, so it is not introduced as a playable evolution. [Twilight Wishes](https://pokemongo.com/news/twilight-wishes-2026) begins November 24; its returning encounters do not establish a new battle form. [Mega Clefable](https://pokemongo.com/news/clefable-super-mega-raid-day-2026) remains deferred until November 28, with its source ranking and move evidence preserved. Gigantamax Melmetal remains excluded pending exact-form GO debut evidence; Dynamax Melmetal remains supported.

## Sources and limitations

PvPoke is pinned to `a8c817915e2978b433a38317b93dce267b64bde7` (November 20). PokeMiners was checked again and remains at `8e227be44f288d34463e23bf04e9b564d3c16f79` (August 29). The refresh covers all 17 non-Normal raid lists, 18 Max attacker lists, support/capability guides, gym rankings and artwork mappings. The artwork audit still covers 228 named forms: 221 images and 7 explicitly unavailable.

Exact-form gender/trade metadata for the two Hisuian regional entries remains unverified in the older GO templates. Gender validation reports 1,634 source-backed forms and three unverified entries, with all 11,876 supported evolution traversals passing. Source rankings do not independently certify live encounter availability.

## Validation and dependency compatibility

Validated alongside Vite 8.3.8, Playwright 1.65.1 and Prettier 3.10.1 from Dependabot PRs #47, #48 and #49. React and React DOM remain matched at 19.3.1. The existing workflows and dependency checks are retained.

Validation results are recorded in [the validation log](validation.md). The reproducible source bundle, versioned catalog, moves CSV/JSON, audit and gender report are included in the refresh.

[Full before/after comparison](../data/update-2026-11-21.json) · [Official event review](../data/event-review-2026-11-21.json) · [Gym source audit](../data/gym-defense-2026-11-21.json).
