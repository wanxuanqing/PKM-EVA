# Database refresh - November 15, 2026

Updated from `2026-11-06-5622bf9fd6f1` to `2026-11-15-c6124cdf73ae`. Changes are local, ready for review, and have not been committed or deployed.

| Coverage                                               |          Before |           After |
| ------------------------------------------------------ | --------------: | --------------: |
| Catalog forms                                          |           1,635 |           1,637 |
| Distinct Pokedex species                               |             959 |             959 |
| GL / UL / ML top-100 recommendations                   | 100 / 100 / 100 | 100 / 100 / 100 |
| Qualifying raid forms / type roles                     |       240 / 355 |       243 / 361 |
| Useful-path Max attackers / type roles                 |         65 / 84 |         67 / 87 |
| Top-five-per-type Max attackers after A filter / roles |         58 / 72 |         60 / 72 |
| Max support forms / roles                              |         20 / 21 |         20 / 21 |
| Gym defenders                                          |              18 |              18 |

Every prior catalog ID and all 1,608 original CSV forms are retained. Existing base stats, CP multipliers, IV calculations and recommendation cutoffs are unchanged.

## Event additions

**Hisuian Sliggoo and Hisuian Goodra** debuted at the November 6–8 in-person Wild Area events, according to [the official announcement](https://pokemongo.com/gowildarea/sendai/gameplay). Both now have separate searchable records and matching regional artwork. Hisuian Sliggoo evolves into Hisuian Goodra with **100 Goomy Candy**. No ordinary Goomy-to-Hisuian Sliggoo route is inferred.

Pinned PvPoke stats are 153 / 190 / 151 for Hisuian Sliggoo and 211 / 255 / 190 for Hisuian Goodra (Attack / Defense / Stamina), consistent with [GO Hub Sliggoo](https://db.pokemongohub.net/pokemon/705-Hisuian) and [GO Hub Goodra](https://db.pokemongohub.net/pokemon/706-Hisuian). Both are Dragon/Steel. PvPoke still marks them unreleased and has no published open-league rankings for them. The official announcement documents their release; no regular-form ranking or gym rating is copied onto them. Their exact-form gender and trade metadata remain unverified because the pinned GO templates predate their debut.

The [global event](https://pokemongo.com/gowildarea/global) confirms Dynamax Dialga, Dynamax Palkia and Gigantamax Duraludon. Current Max attacker recommendations include:

| Form                 | Type   | Tier / source rank | Fast move     | Max move        |
| -------------------- | ------ | ------------------ | ------------- | --------------- |
| Gigantamax Duraludon | Dragon | S / #2             | Metal Claw    | G-Max Depletion |
| Dynamax Palkia       | Dragon | A / #3             | Dragon Breath | Max Wyrmwind    |
| Dynamax Dialga       | Dragon | A / #4             | Dragon Breath | Max Wyrmwind    |
| Dynamax Dialga       | Steel  | A / #3             | Metal Claw    | Max Steelspike  |

The [Into the Wild announcement](https://pokemongo.com/news/into-the-wild-2026) confirms Dynamax Regidrago and Dynamax Meltan. Existing useful paths retain Dynamax Regidrago as Healer S and Dynamax Melmetal as Defender A / Healer A. Evolving a Max-capable Meltan preserves the relevant path; an ordinary copy does not gain Max capability through evolution.

The event also introduces Machamp wearing a modern jacket. Its debut is recorded in the event audit, but a separate costume battle entry is not fabricated from ordinary Machamp: the captured GO templates do not yet identify this exact costume and its restrictions.

## Other recommendation changes

- PvP top-100 ranks, membership and recommended moves are unchanged across all three leagues.
- Six raid type roles newly meet A or better: Absol (Dark A #29), Mega Ampharos (Dark A #26), Hoopa Unbound (Dark A #27), Mega Sharpedo (Dark A #28), Shadow Zekrom (Dragon A #17 and Electric SS #4). These are source ratings; a rating alone does not certify a form's live availability.
- No previously qualifying raid type role leaves the cutoff. Thirty-five retained roles change rank, tier or moves. Mega Chandelure's Fire recommendation changes from Fire Spin / Overheat to Fire Spin / Ominous Wind+, with its mixed-type label retained.
- Max roles enter for the event trio, Jolteon (Electric), both Dynamax Toxtricity appearances (Electric), and Gigalith (Normal). Some existing Steel roles and Hydreigon's Dragon role fall below A. Source rank gaps are preserved rather than renumbered.
- Dynamax Sylveon's suggested fast move changes from Charm to Fairy Wind. Support recommendations remain 9 defender forms and 12 healer forms, across 20 distinct forms. Gym defense remains 18 exact SS/S/A forms.

## Release safeguards and evidence

GO Hub's new Steel table includes **Gigantamax Melmetal**, but a GO release for that exact form could not be verified. It is excluded from current attacker and support recommendations by exact species/name/mode. The raw ranking, benchmark and review reason remain in the bundle and comparison. Dynamax Melmetal remains supported. Completeness validation accounts explicitly for the excluded source rank; missing unexplained ranks still fail. Remove the reviewed exclusion only after verifying its GO debut.

Mega Clefable remains deferred until its announced **November 28** debut, as in the previous snapshot. Source moves and ranking evidence remain in the audit exports.

PvPoke is pinned to `426e5e9f39d3a027849698fb2f5edd9df6056cbf` (November 12). PokeMiners was freshly checked but remains at `8e227be44f288d34463e23bf04e9b564d3c16f79` (August 29). All 17 non-Normal raid lists, 18 Max attacker lists, support and capability guides, gym rankings and artwork mappings were refreshed. The artwork audit covers 228 named forms, with 221 matching images and 7 explicitly unavailable.

## Verification

103 unit/data tests and 31 browser tests pass, including new regional-form search/artwork, evolution details, event Max recommendations and the exact-mode exclusion. Catalog validation, the production build and all 11,876 gender/evolution traversals pass. Of 1,637 forms, 1,634 have source-backed gender metadata; the two new regional forms and historical golisopodsh remain explicitly unverified. Locked dependencies were reinstalled; npm reports zero vulnerabilities.

[Full before/after comparison](../data/update-2026-11-15.json) · [Event evidence](../data/event-review-2026-11-15.json) · [Gym source audit](../data/gym-defense-2026-11-15.json).
