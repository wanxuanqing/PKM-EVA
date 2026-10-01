# Gender audit — October 1, 2026

Audited every supported catalog entry against the bundled GO game-master gender templates, including Shadow variants, temporary forms, cosmetic gender variants and evolution restrictions.

| Check                                      | Result                                                      |
| ------------------------------------------ | ----------------------------------------------------------- |
| Catalog coverage                           | 1,621 entries: 1,608 CSV forms plus 13 supplemental targets |
| Entries with source-backed gender metadata | 1,620                                                       |
| Mega/Primal forms inheriting base gender   | 61                                                          |
| Gender and evolution traversals checked    | 11,792; no incompatible reachable targets                   |
| Unverified entries                         | `golisopodsh` only                                          |

## Corrections

- **Nidoran:** both species have `NIDORAN` in the source template name. The importer now uses the distinct payload species IDs, preventing male/female collisions. Regular and Shadow Nidoran now lock to the correct gender and their normal evolutions are no longer falsely conditional.
- **Mega/Primal forms:** these lack their own spawn gender templates. Gender now follows the corresponding base form, including male Gallade/Latios, female Kangaskhan/Latias, and genderless Mewtwo/Groudon/Kyogre. This does not assert that every catalog Mega is released.
- **Pikachu costumes:** explicit gender-only aliases connect Libre to `PIKACHU_VS_2019` (female), 5th Anniversary to `PIKACHU_FLYING_5TH_ANNIV`, Flying to `PIKACHU_FLYING_01`, and Shaymin Scarf to `PIKACHU_GOFEST_2022` (both genders). These aliases do not grant ordinary Pikachu evolution routes to costumes.
- **Source precedence:** an explicit Normal-form template takes precedence over a species-wide aggregate. Oinkologne's male form therefore remains male even if source records are reordered.
- **Missing evidence:** an empty allowed-gender list now means unverified, distinct from a verified male/female species. The selector displays that limitation for `golisopodsh`, an ambiguous upstream simulator duplicate of Golisopod.

Separate Meowstic, Indeedee and Oinkologne battle forms remain separate. Frillish, Jellicent and Pyroar retain shared cosmetic records. Every explicitly gender-restricted evolution is tested for permitted, forbidden and unknown gender. Fixed-gender selections and reopening saved assessments remain synchronized with the selected form.

## Evidence and reproducibility

The pinned [PokeMiners GO snapshot](https://github.com/PokeMiners/game_masters/tree/8e227be44f288d34463e23bf04e9b564d3c16f79) supplies the gender templates. Catalog version: `2026-10-01-535cab1bf42a`. This checks the bundled data; it is not a new live-event or release-availability audit.

Run `npm run audit:gender` to regenerate [the per-entry report](gender-audit.json). It verifies source/catalog checksums, source species identities, allowed genders, fixed-gender flags, temporary/base and Shadow/regular agreement, and all supported routes for each allowed gender at four IV patterns (including ties and event routes).

The production build, 58 unit/data tests, 16 browser tests and catalog validation passed. The initial gender correction preserved stats, rankings and moves; the subsequent [moves refresh](moves-datasheet.md) updated PvPoke rankings and raid evidence and added nine supplemental forms. Shadow damage calculations and IV thresholds are unchanged.
