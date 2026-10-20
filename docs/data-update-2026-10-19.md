# Database refresh - October 19, 2026

Compared `2026-10-15-4e79a74540b1` with `2026-10-20-2ad2f6d1ea80`. Retrieval completed October 19 in Los Angeles; immutable filenames use October 20 UTC. This refresh updates the local app and its offline moves exports. It has not been deployed.

## Scope and additions

The catalog grew from **1,626 to 1,634 forms**. All 1,608 original CSV records and all previous catalog IDs remain. The eight added entries represent three additional Pokédex species plus separate forms; they are not eight new species.

| Added entries                                         | What changed                                                                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bramblin and Brambleghast                             | Searchable stats and evolution. Bramblin requires 50 Candy and 20 km as your buddy.                                                                         |
| Minior (Meteor) and Minior (Core)                     | Separate defensive/offensive battle-stat records; no ordinary evolution between them.                                                                       |
| Sinistea (Phony/Antique), Polteageist (Phony/Antique) | Distinct form selection and matching evolution paths: 50 Candy for Phony, 400 for Antique. Both Polteageist forms now have sourced ghost A-tier raid roles. |

Bramblin debuted in the [October 13 Buddy Trek event](https://pokemongo.com/news/fall-marathon-buddy-trek-2026). Its walking requirement comes from [GO Hub's evolution chart](https://db.pokemongohub.net/pokemon/946), supplementing the pinned GO template which only specifies Candy. Neither Bramblin nor Brambleghast qualifies for our PvP top 100 or raid A-or-better shortlist. Brambleghast is currently GL #822 and UL #567.

[Minior debuts October 19 at 5 p.m. local time](https://pokemongo.com/news/minior-meteor-showers-2026). Its switch below 50% HP is battle-triggered in the initially supported trainer battles. The app does not simulate that mid-battle switch, and PvPoke currently supplies no ranked recommendation. The shared Core record does not assert that all seven colors have debuted. Meteor artwork is mapped; Core has an explicit unavailable decision rather than substituting a potentially wrong color.

Sinistea and Polteageist are existing species, newly separated here for exact GO Hub form matching. Their base stats and move pools are checked against GO before sharing the base battle record; variant PvP rankings are not invented. The original shared records remain searchable. The shared Sinistea route now requires form confirmation and lists both Candy costs instead of assuming Phony.

## Recommendation changes

| Coverage                                            |          Before |           After |
| --------------------------------------------------- | --------------: | --------------: |
| GL / UL / ML qualifying entries                     | 100 / 100 / 100 | 100 / 100 / 100 |
| Raid forms with SS/S/A roles                        |             259 |             251 |
| Raid type roles                                     |             397 |             370 |
| Useful-path Max attacker forms                      |              57 |              65 |
| Useful-path Max attacker type roles                 |              73 |              84 |
| Top-five-per-type Max attacker forms after A filter |              53 |              58 |
| Top-five-per-type Max attacker roles after A filter |              66 |              72 |
| Max defender/healer forms                           |              17 |              17 |

Counts distinguish a form from a type role: one form can contribute several roles. Temporary forms and Shadows count separately. Source tier changes are not independent evidence of a game balance change. The raid cutoff remains A or better and excludes Normal; the Max attacker cutoff remains A or better.

### PvP top-100 membership

| League | Entry               | Old rank | New rank | Change  |
| ------ | ------------------- | -------: | -------: | ------- |
| GL     | Dusknoir            |      105 |       97 | Entered |
| GL     | Muk (Alolan)        |      106 |       99 | Entered |
| GL     | Sealeo              |      107 |       95 | Entered |
| GL     | Drapion (Shadow)    |       96 |      101 | Left    |
| GL     | Gourgeist (Small)   |       99 |      103 | Left    |
| GL     | Talonflame (Shadow) |      100 |      104 | Left    |
| UL     | Cobalion            |      104 |       93 | Entered |
| UL     | Gastrodon           |      111 |       98 | Entered |
| UL     | Hippowdon           |      101 |       95 | Entered |
| UL     | Hippowdon (Shadow)  |      108 |       92 | Entered |
| UL     | Piloswine           |      113 |       96 | Entered |
| UL     | Samurott (Shadow)   |      119 |       99 | Entered |
| UL     | Charizard           |       97 |      105 | Left    |
| UL     | Crustle             |       84 |      106 | Left    |
| UL     | Hydreigon (Shadow)  |       95 |      127 | Left    |
| UL     | Kommo-o             |       90 |      120 | Left    |
| UL     | Kyurem              |       87 |      108 | Left    |
| UL     | Sylveon             |      100 |      104 | Left    |

84 current GL top-100 entries and 85 UL entries have different species ranks. ML top-100 ranks are unchanged. Recommended movesets are unchanged for the current top 100 in all three leagues. No existing form's base stats changed; the IV calculator, thresholds and Shadow modifiers are unchanged.

### Raids

27 type roles entered the A-or-better shortlist, 54 left, and 57 retained roles changed tier. These are role changes: a Pokémon losing one type role may remain recommended for another type, its Mega form, or another activity. All excluded source rows remain in the moves exports.

Examples of new qualifying roles: Glaceon and Cetitan (ice A), Gengar and Polteageist (ghost A), Heatran (fire A). Chandelure ghost moves from A to S. Rillaboom remains grass S with Razor Leaf / Frenzy Plant (limited), now type rank #12 instead of #14.

Two retained roles have a changed recommended charged move:

- Inteleon water: Hydro Cannon -> Snipe Shot.
- Shadow Rhyperior ground: Earthquake -> Drill Run.

Limited-move flags and source tier/rank are retained per row. Mega Manectric's Discharge+ was already present in the previous snapshot; its official Buddy Trek availability announcement is not counted as a newly imported move.

### Max Battles

Newly qualifying useful-path roles:

- Dynamax Alakazam: fighting A (type rank #7).
- Dynamax Corviknight: flying A (type rank #4).
- Dynamax Flygon: ground A (type rank #4).
- Dynamax Gengar: dark A (type rank #5).
- Dynamax Hitmonlee: fighting A (type rank #6).
- Dynamax Kabutops: bug A (type rank #4).
- Dynamax Kingler: ground A (type rank #5).
- Dynamax Leafeon: normal A (type rank #8).
- Dynamax Passimian: fighting A (type rank #8).
- Dynamax Passimian: normal A (type rank #7).
- Dynamax Swoobat: flying A (type rank #5).

Eight additional forms qualify; some roles belong to forms already recommended for another type. The top-five view gains six qualifying type roles across five additional forms. Existing Max fast/Max move recommendations are unchanged. Tier increases include Dynamax Rhyperior ground S -> SS and Gigantamax Butterfree bug S -> SS. GO Hub benchmark damage values were refreshed as source facts, not an assertion of an in-game nerf. Defender and healer selections, tiers and moves are unchanged.

Dynamax Uxie, Mesprit and Azelf were already source-listed before this refresh; their [official debut is October 24](https://pokemongo.com/news/dynamax-uxie-mesprit-azelf-max-battle-day-2026). The app's Max copy requirement remains conditional. A ranking row does not establish live availability. Gym Defense remains the separately maintained 25-form shortlist.

## Source and importer notes

- PvPoke: `bdbb22c6888d0999f9bee1712a0296309dcab3fb`, upstream commit dated October 17.
- GO Hub: all 17 non-Normal raid type lists, all 18 Max type lists, and both defender/healer guides fetched again.
- PokeMiners GO templates: refreshed fetch, same pinned commit as before (upstream August 29). Release announcements are reviewed separately; this source is not a live release calendar.
- Fixed GO Hub embedded-table reference resolution so repeated move records retain their names and limited-access flags. Missing/circular references reject the import rather than publishing partial moves.
- Added reviewed exact-form aliases and GO signature checks for Sinistea/Polteageist variants.
- Original CSV and prompt are unchanged. All source rows and prior catalog records are retained.

## Validation

- 93 unit/data tests pass, including new reference-parser, debut-stat and evolution-cost checks.
- Production build, catalog checksums/schema validation and full gender/evolution audit pass.
- All 29 browser tests pass, including mobile layouts, offline reload/update behavior, top-100 boundaries and new debut/form selection.
- Artwork mapping: 225 named entries audited, 218 matching images and 7 explicitly unavailable.
- Changed files pass formatting. Repository-wide formatting still reports 12 pre-existing issues in unchanged files: the checks workflow, moves documentation, package.json, movesheet generator, App, DataPanel, ResultCard, TopPokemon, calculator, leagueNames, raidNotes and calculator tests. Those files match HEAD and are outside this data refresh.

The [machine-readable comparison](../data/update-2026-10-19.json) contains every top-100 rank change and every changed included raid/Max role, with before/after moves and tiers. Source checksums and raw captures remain in the normal catalog/source artifacts.
