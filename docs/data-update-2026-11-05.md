# Database refresh - November 5, 2026

Updated from `2026-10-20-2ad2f6d1ea80` to `2026-11-06-5622bf9fd6f1`. The run completed November 5 in Los Angeles; filenames use November 6 UTC. Changes are local and have not been committed or deployed.

| Coverage                                                    |          Before |           After |
| ----------------------------------------------------------- | --------------: | --------------: |
| Catalog forms                                               |            1634 |            1635 |
| Distinct Pokedex species, including supplements             |             959 |             959 |
| GL / UL / ML qualifying entries                             | 100 / 100 / 100 | 100 / 100 / 100 |
| Raid forms with qualifying non-Normal roles                 |             251 |             240 |
| Qualifying raid type roles                                  |             370 |             355 |
| Useful-path Max attackers / type roles                      |         65 / 84 |         65 / 84 |
| Top-five-per-type Max attackers / type roles after A filter |         58 / 72 |         58 / 72 |
| Max support forms / support roles                           |         17 / 17 |         20 / 21 |
| Max defender / healer forms                                 |          7 / 10 |          9 / 12 |
| Gym defenders meeting the reviewed source cutoff            |              25 |              18 |

All 1,608 original CSV forms and every previously supported catalog ID are retained. A form can have several type or support roles. No existing base stats or CP multipliers changed, and the IV calculator and comparison thresholds are unchanged.

## Added form and release evidence

**Mega Chandelure** is the one new catalog entry. [Its official debut was October 31](https://pokemongo.com/news/chandelure-super-mega-raid-day-2026). Its source stats are 335 Attack / 227 Defense / 155 Stamina. Litwick and Lampent now lead through regular Chandelure to the temporary Mega form, preserving IVs and requiring the appropriate Mega unlock/Energy conditions. Source ratings:

- Ghost **SS, #1**: Hex / Ominous Wind+.
- Fire **S, #6**: Fire Spin / Overheat.

The [current GO Hub source](https://db.pokemongohub.net/pokemon/609-Mega) supplies the separate ratings and moves. Ominous Wind+ applies while Mega Evolved and scales with Mega Level.

**Mega Clefable** is already listed by GO Hub as Fairy SS #2 with Fairy Wind / Moonblast+, but [its official debut is November 28](https://pokemongo.com/news/clefable-super-mega-raid-day-2026). It is retained in the raw capture and moves CSV/JSON with `includedInApp: false`, its announced date and exclusion reason. It is not a current assessment or Top 50 recommendation. The dated exact-form deferral expires on the debut date; any still-unmapped qualifying form then rejects the import instead of being silently omitted.

Minior now has source rankings, but remains outside our top-100 cutoff. Its battle-triggered Meteor/Core switch is not modeled as ordinary evolution. Current source ranks:

- Minior (Core): GL #127, UL #553.
- Minior (Meteor): unranked.

## PvP top-100 changes

| League | Pokemon / form      | Previous rank | Current rank | Membership |
| ------ | ------------------- | ------------: | -----------: | ---------- |
| GL     | Drapion (Shadow)    |           101 |           95 | Entered    |
| GL     | Gourgeist (Small)   |           103 |           96 | Entered    |
| GL     | Talonflame (Shadow) |           104 |           98 | Entered    |
| GL     | Wigglytuff          |           110 |          100 | Entered    |
| GL     | Dunsparce           |            83 |          102 | Left       |
| GL     | Dusknoir            |            97 |          106 | Left       |
| GL     | Muk (Alolan)        |            99 |          105 | Left       |
| GL     | Sealeo              |            95 |          109 | Left       |
| UL     | Crustle             |           106 |           84 | Entered    |
| UL     | Hydreigon (Shadow)  |           127 |           92 | Entered    |
| UL     | Kommo-o             |           120 |           91 | Entered    |
| UL     | Kyurem              |           108 |           86 | Entered    |
| UL     | Lickilicky          |           102 |          100 | Entered    |
| UL     | Sylveon             |           104 |           99 | Entered    |
| UL     | Cobalion            |            93 |          103 | Left       |
| UL     | Gastrodon           |            98 |          115 | Left       |
| UL     | Hippowdon           |            95 |          105 | Left       |
| UL     | Hippowdon (Shadow)  |            92 |          110 | Left       |
| UL     | Piloswine           |            96 |          112 | Left       |
| UL     | Samurott (Shadow)   |            99 |          118 | Left       |

Among the current top 100, 89 GL and 87 UL entries changed rank. ML top-100 ranks and membership are unchanged. **Cramorant GL changes Dive to Surf**; its other recommended moves remain Peck and Fly. No other recommended moves changed among the current top 100.

## Raid changes

Five type roles entered the current shortlist and 20 left. The cutoff remains GO Hub A or better, excluding Normal. These are type-role changes, so a Pokemon may remain useful for another type, its Mega form, PvP, Max Battles or gym defense. Newly qualifying roles:

- Chandelure (Mega): fire S, #6; Fire Spin / Overheat.
- Chandelure (Mega): ghost SS, #1; Hex / Ominous Wind+.
- Incineroar: dark A, #24; Snarl / Darkest Lariat.
- Kyurem (White): steel A, #13; Steel Wing / Ice Burn.
- Yveltal: dark A, #25; Snarl / Dark Pulse.

Most removals are Ghost roles that no longer meet A tier after the source refresh, including regular Gengar and the Polteageist forms. Their species, evolution branches and source-listed moves remain available as excluded audit evidence. Source-tier changes alone do not establish an in-game balance change.

There are no substantive move changes among retained raid roles. Three Tapu rows change only the apostrophe in Nature’s Madness; their limited-access flags remain intact. Full before/after rows are in the machine-readable comparison.

## Max Battle changes

Numeric attacker recommendations, type ranks and benchmark values are unchanged. The support guides add:

- **Dynamax Dialga:** Defender A; Dragon Breath / Metal Claw.
- **Dynamax Melmetal:** Defender A with Thunder Shock, and Healer A.
- **Dynamax Regidrago:** Healer S.

These three forms are absent from the numeric attacker tables. Their explicit Dynamax labels are separately captured from [GO Hub's Max attacker guide](https://pokemongohub.net/post/guide/max-attackers-tier-list/), alongside the [defender](https://pokemongohub.net/post/guide/max-defenders-tier-list/) and [healer](https://pokemongohub.net/post/guide/max-healers-tier-list-june-2025/) ratings. The app still requires a Max-capable copy and does not grant Max capability through ordinary evolution. These are source-listed roles, not independent live-release certification or boss simulations.

The guides also contain low-tier Substitute placeholders linked to Pokedex 0. They are retained as flagged raw evidence and excluded from advice. Unknown or duplicate actual useful forms still reject the import.

## Gym defense

[GO Hub's current bulk list](https://db.pokemongohub.net/best/gym-defenders) uses revised SS/S/A tiers. The app now includes its 18 forms rated A or better. Blissey is SS; Chansey, Snorlax and Dondozo are S; the other 14 are A.

Seven former selections are now B and leave the gym shortlist: Tyranitar, Garchomp, Relicanth, Kingambit, Hippowdon, Florges, Vaporeon. Their catalog entries remain. [The gym source capture](../data/gym-defense-2026-11-05.json) preserves the prior 25-form tiers, current first 100 source rows, selected rows, retrieval date and HTML checksum.

## Source and importer changes

- PvPoke pinned to `e02bde78d19be9b9099b5a6629c6a8d0835a53be`, upstream November 3.
- Refetched all 17 non-Normal raid lists, 18 Max attacker lists, both Max support guides, explicit Max-mode evidence, gym tiers and the artwork mapping.
- PokeMiners is still pinned to `8e227be44f288d34463e23bf04e9b564d3c16f79` (August 29); the fetched upstream data has not changed. Reviewed release announcements supplement its older templates.
- Raid matching now recognizes newly released PvPoke forms before the old app snapshot has been regenerated. Reviewed upcoming forms remain excluded with their source evidence.
- The moves export now retains mapped lower-tier rows even when a supplemental form has no current qualifying raid role. Original CSV evidence, limited-move flags and all previous catalog IDs remain.
- The moves export compares against the October 20 baseline, rather than any intermediate local refresh.
- Artwork: 226 named forms audited, 219 matching images/sprites, 7 explicitly unavailable. Mega Chandelure has a matched form image.

## Security maintenance

The locked transitive development dependency **undici 7.30.0** was flagged by npm audit. It was patched to **7.30.2** within the existing dependency range. No direct package versions changed. A clean reinstall now reports **zero vulnerabilities**.

## Validation

- 101 unit/data tests pass, including the new Mega path, dated deferral expiry, explicit Max-mode evidence and low-tier placeholder handling.
- Production build, catalog validation and the gender/evolution audit pass.
- Gender audit: 1,635 forms, 1,634 source-backed genders, 63 temporary forms and 11,876 successful traversals; only the historical `golisopodsh` record remains unverified.
- All 30 browser tests pass, including mobile layouts, offline reload/update, updated top-100 boundaries, Mega Chandelure paths and dual-role Max Melmetal.
- Changed files pass formatting. The full check passes with `--end-of-line auto`; the default local check still flags 8 unchanged CRLF files (package.json, App, ResultCard, TopPokemon, calculator, leagueNames, raidNotes and calculator tests). These are existing Windows line-ending differences.

[Complete machine-readable comparison](../data/update-2026-11-05.json).
