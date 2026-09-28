# Build a phone-first Pokémon GO assessment app

You are the implementation agent. Build a working application, not just a plan. I will attach a CSV containing a Pokémon GO catalog with suggested uses and ideal IVs. Use it as an initial dataset and audit its assumptions before treating it as authoritative.

## Goal

I want to search any Pokémon by name, select its form, enter Attack/Defense/HP IVs, and immediately see:

- Its useful roles: Great League (GL), Ultra League (UL), Master League (ML), raids, or collection.
- Useful reachable evolutions, not just the selected species.
- Ideal IVs for each target and role.
- My IV rank, IV percentile, and percentage of ideal stat product for PvP.
- A clear Keep / Trade / Transfer / Review recommendation with the reason.

This must cover the full Pokémon GO catalog represented by the attached CSV, not only Pokémon in my personal inventory. Do not confuse forms with unique Pokédex species. Explain any missing or unsupported entries.

## Technology and hosting

- Build a responsive React + TypeScript app with Vite.
- Use a static architecture suitable for Cloudflare Pages free hosting. No paid API, required account, database, or running Python backend.
- Run IV calculations in the browser. Use a Web Worker if necessary to keep typing and scrolling responsive, and cache calculated distributions by species, league, level settings, and data version.
- Python is optional for preparing and validating data during development; it must not be required at runtime.
- Support a PWA manifest, home-screen installation where supported, and offline use after required assets/data have loaded. Handle updates without silently mixing data versions.
- Store preferences, recent searches, and optional saved assessments on the device.
- Supply deployment instructions and a production build. Publish only if I explicitly request deployment or have already authorized it in this project.

## Phone experience

Design for a 360–430 px-wide phone first, with a useful desktop layout too.

1. A prominent searchable Pokémon selector with autocomplete. Match names case-insensitively and tolerate punctuation, accents, gender symbols, and common form aliases. Clearly distinguish regular, regional, Shadow, Mega, and other battle-relevant forms.
2. Three large labeled IV fields, each accepting integers 0–15. Also support pasting `1/12/13`. Use suitable mobile keyboards and accessible controls.
3. Optional current level, maximum level (default 50), and Best Buddy toggle (effective maximum 51). Advanced settings can be collapsed. Do not require current CP/level for a theoretical IV assessment.
4. Immediate recommendation banner, followed by one stacked card per qualifying evolution/league or raid role. No horizontal scrolling or wide results table on phones.
5. Each PvP card shows target name/form, species meta rank, ideal IVs, the input IV rank and percentile. Expand details for stat-product percentage, target CP/level, calculated stats, relevant moves if verified, and source date.
6. Sort useful options sensibly while preserving all qualifying alternatives. Do not automatically choose one evolution solely because its IV percentile is higher.
7. Explain species rank versus IV rank versus IV percentile with accessible help text. Use text/icons as well as color.
8. Display data freshness and meaningful empty/error states. Do not treat an unavailable or unknown ranking as proof that a Pokémon is useless.

Prefer a clean, compact interface with readable type, comfortable spacing, and tap targets around 44 px or larger. Avoid implementation jargon in the main user flow. Pokémon art is optional; use only permitted assets and do not make the app depend on image availability.

## My assessment rules

- A species/form qualifies for PvP when its current overall species rank is strictly **below 200** in open GL, UL, or ML: ranks 1–199 qualify; rank 200 does not.
- My definition of good overall IV is strictly **above 90%**: `(Atk IV + Def IV + HP IV) / 45 * 100`. This is not a percentile. At least 41/45 qualifies.
- For capped-league PvP, use a configurable IV percentile threshold, initially strictly above 90%. Identify this as an app default, separate from the overall-IV rule.
- Keep useful GL/UL copies that clear the PvP percentile threshold. For ML and raids, use the overall-IV threshold as a preference, while explaining that IVs alone do not determine performance.
- When a species is useful but this copy is unsuitable, recommend Trade if it is tradable. Explain that trading rerolls IVs and does not guarantee improvement.
- Shadows cannot be traded. A useful Shadow with imperfect IVs should generally receive Keep/Review, with context, rather than an automatic transfer verdict.
- Preserve collection considerations: shiny, costume, rarity, sentimental value, 100%/0% IV collectibles, and Max Battle capability when the user supplies those flags. Unknown flags must not be inferred from ordinary species data.
- Collection value is subjective. `15/15/15` is a perfect-IV collection target, not a prerequisite for keeping a collectible.
- Recommendations are advice only. Never perform transfers, trades, or other game actions.

## IV calculation specification

The CSV alone is insufficient. Obtain and version the base stats, precise level CP multipliers, evolution/form relationships, and ranking data from appropriate sources. PvPoke's open-source data is a possible starting point; inspect its current schema and license.

Implement the calculator as a pure TypeScript module independent of the UI:

1. Enumerate all 4,096 combinations of Attack, Defense, and HP IVs from 0–15 by default.
2. For GL and UL, find the highest legal half-level for each IV combination under the CP cap (1,500 or 2,500) and selected maximum level. Respect game-specific minimum levels or eligibility restrictions where relevant.
3. Use unrounded effective Attack and Defense, and floored HP with the game's minimum HP rule. Apply the correct CP formula, flooring, and minimum CP rule using precise CP multipliers.
4. Rank by `effective Attack × effective Defense × HP`. Account explicitly for tied stat products using a stable numeric comparison. Give ties the same rank and expose tied ideal IVs rather than pretending there is always a single optimum.
5. Define rank as `1 + number of eligible combinations with strictly greater stat product`.
6. Display rank-based percentile as `100 * (N - rank) / (N - 1)`, where N is the size of the comparison pool; handle N=1. Label the comparison pool and use this convention consistently.
7. Separately display `100 * input stat product / best stat product` as **% of ideal stat product**. It is not a percentile or a percentage of battle wins.
8. For ML, compare at the selected maximum level, respecting the actual format's constraints. Do not assume the GL/UL low-Attack preference applies to ML.
9. If current level is supplied, flag targets already over the cap; Pokémon cannot be powered down. Do not silently alter the theoretical comparison pool based on this copy's current level.
10. If adding acquisition-IV floors, use an explicitly selectable comparison pool. Do not silently replace the default all-IV comparison with a raid, trade, or research floor.
11. Preserve IVs through ordinary evolution. Validate gender restrictions, regional branches, special evolution requirements, form changes, and Mega/Primal eligibility. Never imply a regular Pokémon can become a Shadow by evolution. Do not model purification as ordinary evolution; it changes IVs and Shadow status.
12. Calculate Shadow CP correctly; the Shadow damage modifiers are not a CP bonus. Keep Shadow and regular meta rankings separate.

For raids, show overall IV percentage and the 15/15/15 target. Do not invent a raid-performance percentile from IV totals or PvP stat product. Actual raid effectiveness depends on moves, opponent, and conditions. A future boss-specific simulator is outside the initial scope.

## Data import, audit, and updates

- Inspect the attached CSV and map columns robustly; support UTF-8 BOM and proper CSV quoting. Preserve its original content as an input snapshot.
- Use stable species/form IDs rather than display names as keys. Do not parse important logic out of presentation strings such as `Dusknoir #24` throughout the UI; normalize them once.
- Structure normalized data so each species may have multiple targets and roles, each with its own evidence, rank, ideal-IV calculation, and notes.
- Audit CSV availability claims, Mega/Shadow relationships, evolution paths, and raid labels. The CSV was generated using broad classification rules; missing raid labels are not proof of no raid value, and a simulator's `released` flag may not establish actual GO availability.
- Distinguish strong raid options, budget alternatives, collection-only assessments, and insufficient evidence. Do not label every high-CP Pokémon raid-useful.
- Retain source URLs, retrieval date, source version/commit when possible, league rules, and calculator version. Show a compact date in the UI and detailed provenance in an About/Data section.
- Fetch external data during a controlled build/update step, not on every user search. Ship versioned snapshots for fast, reliable use. Keep the previous valid snapshot if an update fails.
- Provide a repeatable update command and document what requires manual review, especially raid judgments and release status.

## Verification

Test meaningful calculator and data behaviors:

- CP/HP rounding and half-level boundaries.
- Rank ties, ideal combinations, and percentile conventions.
- Level 50 versus Best Buddy level 51.
- A current copy already exceeding a league cap.
- Species too weak to approach a cap, and ineligible candidates.
- Regular/Shadow separation and restricted evolution branches.
- Species rank 199 versus 200, and overall IV 40/45 versus 41/45.
- Search aliases, malformed IV input, and unknown/missing source data.

Compare several calculated results with an independent trusted calculator using identical level and IV-floor settings. These earlier Duskull results are useful regression candidates, not unquestionable truth:

| Input | Target | Settings | Previously calculated result |
|---|---|---|---|
| Regular Duskull, 1/12/13 | Dusclops GL | Level cap 50, all 4,096 IVs | Rank 61; percentile 98.53%; ideal 0/11/15; target level 44.5, CP 1493 |
| Regular Duskull, 1/12/13 | Dusknoir UL | Level cap 50, all 4,096 IVs | Rank 154; percentile 96.26%; ideal 0/15/15; target level 50, CP 2475 |

Investigate discrepancies rather than hardcoding these results. Meta ranks change independently of the IV calculator.

Verify the actual interface at phone widths, including keyboard input, long Pokémon names, expanded cards, empty search, and form changes. Confirm there is no horizontal overflow and the production build works.

## Deliverables and working approach

Deliver:

- Working source code with a sensible module structure.
- Versioned normalized data and repeatable import/update scripts.
- Calculator tests and brief independent validation results.
- README with local setup, build, data update, and Cloudflare Pages deployment instructions.
- A mobile-ready production build and preview where the environment supports it.
- A concise list of material data limitations and remaining optional features.

Begin by inspecting the attached CSV and existing workspace. Make routine implementation decisions autonomously and proceed to a working first version. Ask only for essential missing information, and continue independent work while waiting. Do not require accounts, cloud credentials, or deployment approval merely to build and test the app locally.
