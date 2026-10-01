# App moves datasheet

Updated October 1, 2026. Catalog: `2026-10-01-535cab1bf42a`.

The app's Data screen offers [CSV](../public/data/moves-2026-10-01-535cab1bf42a.csv) and [JSON](../public/data/moves-2026-10-01-535cab1bf42a.json) exports. Both contain the same 846 rows and correspond to the app's current immutable catalog. JSON preserves structured move flags and source details; CSV provides a flat table for filtering.

## Coverage

| Check                                                     | Result                                   |
| --------------------------------------------------------- | ---------------------------------------- |
| Qualifying GL/UL/ML entries verified                      | 597                                      |
| Changed movesets among current qualifying entries         | 10                                       |
| Current qualifying entries without a prior ranking record | 7                                        |
| Previously qualifying entries now outside the cutoff      | 10, retained as excluded comparison rows |
| Exact-form GO Hub pages checked                           | 174                                      |
| Raid forms with sourced suggestions                       | 168, previously 121                      |
| Expanded qualifying raid type roles                       | 218                                      |
| Raid forms without qualifying suggestions                 | 9, previously 54                         |

## PvP verification

The full PvPoke game master and GL/UL/ML rankings were refreshed together to commit [`332d727a8649db56fa2ee73ee0b55feeb25127bb`](https://github.com/pvpoke/pvpoke/tree/332d727a8649db56fa2ee73ee0b55feeb25127bb). Every qualifying recommended Fast Move is checked against that exact form's Fast Move pool, and both Charged Moves against its Charged Move pool. Names, Elite/legacy flags, ranks, source URLs and the previous recommendations are recorded. The importer fails instead of silently dropping an invalid qualifying move.

Changed move selections: Zekrom UL; Centiskorch, Chandelure, Shadow Chandelure, Dhelmise, Golurk, Shadow Golurk, Necrozma, Salamence and Shadow Salamence ML. Rank changes are recorded independently from moveset changes. New source forms are not treated as proof of release availability.

## Raid verification

Recommendations come from exact-form GO Hub pages, including separate Shadow/Mega/regional forms. The importer checks the page identity and extracts each recommended attacking role, its tier/rank, Fast Move, Charged Move and limited-access markers. It retains factual records plus source-page checksums and retrieval times in the compressed source bundle.

The expansion cutoff is **B tier or better** for a non-Normal attacking role. This is a general recommendation rule, not a boss simulation. A multi-role Pokémon retains each qualifying role; for example, [Chandelure](https://db.pokemongohub.net/pokemon/609) has Ghost and Fire sets. The original type shortlist remains available where there is no individual-page expansion.

The nine remaining candidates are not silently assigned moves:

- Arcanine, Hariyama, Leafeon, Magmortar, Typhlosion and Unfezant have only roles below the expansion cutoff.
- Regular and Shadow Regigigas have Normal roles, excluded by the existing app policy.
- `golisopodsh` is an ambiguous simulator duplicate without an exact verified GO Hub mapping. Its original CSV claim and historical base stats are preserved; the distinct current `golisopod_shadow` record is not conflated with it.

Source-listed moves for excluded roles are still present in the datasheet with `includedInApp=false`. A separate row preserves any unresolved app candidate. `includedInApp=true` with an empty moves list means an unresolved candidate card, not a verified recommendation.

## Reproduce

Run `npm run moves:update` for a new public-source capture and import. An interrupted capture can be resumed with `node scripts/update-moves.mjs --resume` (cached pages must be less than 24 hours old), followed by `npm run data:update -- --offline`. For a deterministic rebuild from bundled sources, use only the offline command.

The build, 58 unit/data tests and 16 browser tests passed. Tests cover exact source agreement, form mismatches, limited moves, excluded roles, CSV/JSON agreement, mobile cards, downloads, accessibility and offline behavior. IV thresholds and Shadow damage calculations are unchanged.
