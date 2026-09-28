# Validation results

The initial implementation was checked on Windows with Node 24, Chrome and the production Vite build. Automated checks are reproducible using the README commands.

The final production build passed **49 unit/data tests and 10 browser tests**. Catalog validation retained all 1,608 input forms, 953 unique species and four supplemental evolution entries. The original CSV is preserved byte for byte.

## Independent calculator comparison

The unmodified [`includes/calculate.js` from PvPIVs.com](https://github.com/DeathbyToast/PvP_IVs/blob/8e580166c8a4bbe1995a55a673d930265ef0321b/includes/calculate.js) was run in an isolated Node VM. Base stats came independently from that project’s `pokeListObj.js`, and were checked against the normalized catalog. The reference received identical minimum level, maximum level, IV floor and CP-cap settings.

All **28,888 spreads** across these configurations matched for CP, highest legal half-level, unrounded Attack/Defense and floored HP:

| Target       | IVs      | Max / floor | PKM-EVA rank | Reference native rank | CP / level  |
| ------------ | -------- | ----------- | -----------: | --------------------: | ----------- |
| Dusclops GL  | 1/12/13  | 50 / 0      |           61 |                    62 | 1493 / 44.5 |
| Dusknoir UL  | 1/12/13  | 50 / 0      |          154 |                   154 | 2475 / 50   |
| Dusknoir UL  | 1/12/13  | 51 / 0      |          123 |                   123 | 2489 / 50.5 |
| Azumarill GL | 0/15/15  | 50 / 0      |            1 |                     1 | 1499 / 45.5 |
| Medicham GL  | 5/15/15  | 50 / 0      |            1 |                     1 | 1499 / 50   |
| Charizard UL | 10/14/15 | 50 / 10     |            1 |                     1 | 2499 / 32   |
| Mewtwo ML    | 15/15/14 | 50 / 0      |            4 |                     4 | 4713 / 50   |
| Bulbasaur GL | 0/0/0    | 1 / 0       |         4086 |                  4096 | 12 / 1      |

All cases use minimum level 1 for direct calculator comparison. Application eligibility/minimum-level rules are tested separately; these comparisons do not assert acquisition availability.

### Why Dusclops shows 61 here and 62 on the reference

At level 44.5, **1/12/13 and 1/12/14 have the exact same effective Attack, Defense, HP=108 and stat product=2,194,018.895820621**. Their CP differs: 1493 versus 1499. Sixty combinations have a strictly greater product. Under the requested shared-rank rule both are rank **61**, percentile **98.5347985%**.

PvPIVs rounds products to integers and breaks ties with additional attributes including CP and Stamina IV. That assigns the 1/12/13 spread native rank 62. PKM-EVA intentionally does not copy that tie-breaking convention. The result in the prompt is confirmed under its stated convention rather than hardcoded.

Dusknoir UL at level cap 50 is rank **154**, percentile **96.2637363%**; its ideal is **0/15/15**. With level 51 available, the input reaches level 50.5/CP 2489 and rank 123, with ideal **0/12/14**. Species meta rank is independent of these calculations.

Medicham exposes tied ideals **5/15/14 and 5/15/15**. Low-level Bulbasaur demonstrates many shared HP/stat-product ties, which explain the larger native-rank difference. The reference’s percentile is not copied: PKM-EVA applies the specified rank-based formula consistently.

Raw settings, dates, hashes and results are in [independent-validation.json](independent-validation.json). Rerun `node scripts/validate-independent.mjs` to regenerate it.

## Interface and offline behavior

Tests exercise production pages at **360, 390, 430 and 1280 pixels** and assert no horizontal overflow, including expanded cards and long form names. Keyboard autocomplete, form changes, malformed IVs, collection flags, gender restrictions, current-level warnings, Best Buddy and persistence are covered.

Offline testing reloads the app with networking disabled, then searches another species and calculates new results. It found and fixed a cache mismatch caused by Vite’s `Vary: Origin` header on module assets. The same-origin immutable asset cache now handles that correctly.

The update test serves two service-worker versions and checks that the second remains waiting until **Update & reload** is selected. A separate corrupt-catalog test verifies that a checksum/version mismatch produces a recoverable error. The importer failure test verifies that a failed update leaves the previous published pointer intact.

Automated axe accessibility checks cover the expanded assessment interface and Data screen. Screenshots are in [screenshots/](screenshots/). These checks are evidence for tested states, not a claim that every browser or assistive technology has been manually certified.
