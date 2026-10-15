# PKM-EVA

A phone-first Pokémon GO evaluator built with React, TypeScript and Vite. Search a Pokémon and form, enter three IVs, and compare all supported useful evolution paths. Everything runs in your browser; no account, API key, database or Python server is required.

The supplied `prompt.md` and CSV remain unchanged. The original catalog contains **1,608 forms across 953 Pokédex species**. The current snapshot includes 13 supplemental source entries, for 1,621 supported forms. Forms are keyed by stable IDs, never by display name; inclusion does not confirm GO release availability.

## Run locally

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Private vulnerability reports: [SECURITY.md](SECURITY.md). Read the [privacy statement](docs/privacy.md), [maintenance and release process](docs/releases.md), and [changelog](CHANGELOG.md).

Use Node.js 24 LTS. In Windows PowerShell:

```powershell
cd C:\Users\wanxu\OneDrive\Documents\GitHub\PKM-EVA
npm.cmd ci
npm.cmd run dev
```

Open the URL printed by Vite. On macOS/Linux, use `npm` in place of `npm.cmd`. `npm.cmd` avoids PowerShell execution-policy problems with the `npm.ps1` shim.

The initial screen loads **Duskull, 1/12/13 as an explicitly labeled example**. Enter your own values to assess a copy. Selecting a different Pokémon clears copy-specific collection flags and current level; gender resets to unknown unless the selected species or battle form fixes it. Your general comparison preferences remain.

For the production build and offline preview:

```powershell
npm.cmd run build
npm.cmd run preview -- --port 4173
```

Open <http://127.0.0.1:4173>. `dist/` is the complete static production output. Opening `dist/index.html` directly with `file://` will not run modules, fetch data or install a service worker. PWA features require HTTPS or localhost; a development server does not install the service worker.

## What it does

Pictures use an audited mapping of all 219 named entries in `src/data/artwork-forms.json` (reviewed 2026-10-10). This includes regional, Mega, alternate battle, gender and supported costume forms: 213 have matching artwork or form sprites. Shaymin Land and Sky, for example, have separate images. Shadow entries reuse their corresponding form without Shadow effects. Six costumes have no matching PokeAPI image (Armored Mewtwo and Pikachu Flying, 5th Anniversary, Horizons, Kariyushi and Shaymin Scarf); these show an unavailable message instead of the base species. Newly added named forms also fail safely until mapped. Sizes are not visually scaled, and shiny colors are not modeled. Source URLs are bundled locally; no runtime API requests are needed.

To refresh the mapping, run `node scripts/update-artwork.mjs`, then `npm run format`, `npm test`, `npm run build` and `npm run test:ui`. The updater checks source species identity and image availability before writing the mapping. The catalog coverage test fails if a new named entry has no explicit artwork decision. Review changed images and unavailable entries before committing.

- Autocomplete tolerates case, punctuation, accents, gender symbols and form aliases. Type IVs separately or paste `1/12/13`.
- Open GL/UL/ML species ranks **1–199** qualify. Every qualifying supported target gets a card, ordered by league and species rank; one evolution never hides another because of IV percentile.
- GL/UL keep preference defaults to IV percentile **strictly above 95%**. ML and verified raid roles use overall IVs **strictly above 90%**, meaning at least **41/45**. Existing stored 90th-percentile preferences migrate once to 95; other custom thresholds and saved assessment settings remain intact.
- Trade advice checks Shadow status, source tradability, and the “already traded” flag. Trades reroll IVs and do not guarantee an improvement. Useful Shadows receive Keep/Review advice.
- Collection flags protect shiny, costume, rare, sentimental and Max Battle copies. Perfect and zero-IV spreads are recognized as collectibles. Collection value does not require perfect IVs.
- A Transfer suggestion requires the explicit “ordinary extra” flag acknowledging missing battle evidence. Missing rankings alone produce Review. The app never performs game actions.
- Preferences, recent searches and up to 100 optional saved assessments stay on this device. Opening a saved assessment recalculates it; a changed source version is disclosed.

## Calculation rules

`src/lib/calculator.ts` is a pure TypeScript module. It enumerates all 4,096 IV combinations by default, applies precise source CP multipliers and searches legal half-levels. GL/UL caps are 1,500/2,500; open ML has no CP cap. CP and HP are floored and have a minimum of 10; Attack and Defense are not rounded. Shadow damage modifiers never alter CP.

Stat product = effective Attack × effective Defense × HP. Stable integer keys quantize products to 0.000001 solely for floating-point tie comparison. Tied products have the same competition rank: `1 + number of strictly greater products`. All tied ideal IVs are retained.

Rank percentile is `100 × (N − rank) / (N − 1)`; N=1 is defined as 100%. `% of ideal stat product` is a separate ratio. Neither measures battle wins. An explicitly selected IV floor changes the pool; current level never does. A copy already over the cap is flagged because it cannot be powered down.

ML and raid cards both display **Overall IVs (sum / 45)** and explicitly state their shared preference of strictly above 90%. ML also retains its separately labeled stat-product percentile, IV rank, ideal spreads and detailed stats. GL/UL cards state the selected percentile threshold. No calculator or Shadow modifiers changed.

Gender-specific battle forms retain stable IDs and separate source rankings, stats and moves. Cosmetic male/female forms share a record only when their sourced battle stats and moves match and no separate catalog record exists. Fixed genders come from GO templates; controls and reopened saved assessments follow the selected form. Unknown gender leaves restricted evolution paths conditional; known gender filters incompatible paths. Oinkologne’s existing male record is explicitly labeled Male without changing its ID or original CSV evidence.

The [full gender audit](docs/gender-audit.md) covers every catalog entry. Run `npm run audit:gender` to check source evidence and evolution paths and regenerate the per-entry report. Mega/Primal forms inherit base gender; unresolved exact forms are explicitly marked unverified.

Calculations run in a Web Worker. Up to 32 distributions are cached in memory and IndexedDB, keyed by snapshot, calculator version, form, league, minimum/maximum level, eligibility and IV floor. Changing IVs reuses the distribution. Storage failure does not prevent calculation.

## Data and updates

Gym Defense is a separate role using GO Hub's S/A+ bulk shortlist, reviewed 2026-10-02. The 25 exact regular forms and reachable evolution paths are recognized without a minimum IV percentage; Normal types are allowed. Conditional paths require review, and Shadow/costume/temporary forms do not inherit ratings. These are species-level Defense × Stamina tiers, not simulations or an instruction to power up every copy. See [gym-defense scope and sources](docs/gym-defense.md). The shortlist is maintained separately from raid/PvP refreshes in `src/lib/gym.ts`.

The assessment list shows only sourced raid roles rated A or better, excluding Normal. CSV-only backup candidates and lower-rated roles are hidden from that list; their original records and datasheet evidence remain available.

The browser downloads an immutable, versioned local catalog, verifies its SHA-256 and checks its version against the application. It never queries a third-party service during a search.

```powershell
npm.cmd run moves:update
npm.cmd run data:validate
npm.cmd test
npm.cmd run build
```

`moves:update` refreshes pinned PvPoke game-master/ranking files and GO Hub's shortlist plus exact-form moves pages, then validates and publishes a catalog and matching CSV/JSON datasheets. It retains the separately dated GO evolution/gender snapshot. Fetch/schema/checksum failures leave the previous app pointer intact. Existing published snapshots remain available; no deployment occurs. `data:update` without `--offline` is the baseline all-source refresh; run `moves:update` afterward to add the exact-form raid enrichment.

To regenerate from the checked-in compressed source snapshot without fetching:

```powershell
npm.cmd run data:update -- --offline
```

The catalog identity includes source contents, CSV hash, manual rules and the normalizer implementation. `data/raw/` preserves the exact original CSV and compressed source inputs; `data/sources-current.json` selects the input bundle. `public/data/` contains normalized browser snapshots, and `src/data/current.json` selects one. Each import writes a detailed `data/audit-*.json`.

**Manual review remains necessary after an update:** verify new form IDs and release status, changed evolution conditions, event-only branches, source minimum levels, raid shortlist changes and CSV budget suggestions. Update `data/manual-rules.json` with explicit evidence; do not promote the simulator’s `released` flag into proof of GO availability. Do not run updates automatically during hosting builds.

Sources:

- [PvPoke source and MIT license](https://github.com/pvpoke/pvpoke): base stats, precise CP multipliers, overall open-league rankings and suggested moves. The bundled About/Data screen records the commit, source dates and file hashes. License retained in `public/PVPOKE-LICENSE.txt`.
- [PokeMiners game masters](https://github.com/PokeMiners/game_masters): GO evolution branches, gender requirements, temporary evolution, form changes and tradability. Game templates can contain unreleased content and event-independent settings.
- [GO Hub attacker lists](https://db.pokemongohub.net/best/attackers-per-type): a source-based raid shortlist by attacking type. Normal-type listings are excluded from the strong shortlist because they do not provide super-effective coverage. This is not a boss-specific simulation.
- GO Hub individual Pokémon pages expand raid recommendations by exact form and attacking role. Roles rated A or better qualify; lower tiers and excluded Normal roles remain in the [moves datasheet](docs/moves-datasheet.md). Sources, retrieval times, role ranks, previous moves and limited-access flags are retained. Download CSV/JSON from the app's Data screen.
- The supplied CSV: preserved claims and candidate budget raid alternatives. Its presentation strings are normalized only once during import.

## Verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:ui
node scripts/validate-independent.mjs
```

Local browser tests use installed Google Chrome in headless mode; CI uses Playwright Chromium. Set the local `channel` in `playwright.config.ts` to `msedge` if using Edge instead. The browser tests start a production preview automatically if one is not already running; CI always starts its own server.

Calculator/data tests cover rounding, half-level boundaries, ties, percentile conventions, Best Buddy, unreachable caps, ineligible forms, comparison floors, strict thresholds, malformed inputs, aliases, Shadow separation, restricted branches, CSV quoting/BOM handling and failed-update retention. Browser tests cover 360/390/430/1280 px widths, keyboard search, form selection, saved assessments, expanded cards, overflow, accessibility, offline reload, catalog integrity and explicit update activation.

Independent validation uses the **unmodified PvPIVs.com calculator and its own base-stat records**, pinned to commit `8e580166c8a4bbe1995a55a673d930265ef0321b`. It compares CP, level, Attack, Defense and HP for **28,888 spreads across eight configurations**. Downloaded reference code stays in ignored `.work/`; only results and hashes are included. See [validation notes](docs/validation.md) and [machine-readable results](docs/independent-validation.json).

## Cloudflare Workers Static Assets

Use Workers Static Assets for a new Cloudflare deployment. Connect the GitHub repository and configure:

| Setting                       | Value                                                            |
| ----------------------------- | ---------------------------------------------------------------- |
| Worker name                   | `pkm-eva`                                                        |
| Root directory                | This project’s root; `PKM-EVA` if publishing a parent repository |
| Build command                 | `npm run build`                                                  |
| Deploy command                | `npx wrangler deploy`                                            |
| Asset directory               | `dist`, configured in `wrangler.json`                            |
| Node version                  | 24, set using `NODE_VERSION` or `.node-version`                  |
| Runtime environment variables | None                                                             |

Commit and push `wrangler.json` with the app. It defines the Worker name, static asset directory and required compatibility date. The date pins Cloudflare runtime behavior; it is independent of the Pokémon data snapshot date. Keep Cloudflare's automatically created deployment token option; the app itself needs no API keys. Preview builds can remain disabled for the initial setup, and Cloudflare Access should be off if the site is intended for public access.

If deploying a commit without `wrangler.json`, use the explicit deploy command `npx wrangler deploy --name pkm-eva --assets ./dist --compatibility-date 2026-09-26`.

See [Cloudflare build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) and [compatibility dates](https://developers.cloudflare.com/workers/configuration/compatibility-dates/). The deployed app is static; no server-side Worker script is required. `public/_headers` supplies cache and security headers, and is intentionally excluded from service-worker precaching because it is hosting configuration. Existing Cloudflare Pages projects can still build with `npm run build` and publish `dist`.

After loading on HTTPS, wait for **“Ready for offline use”**, then use the browser’s install/Add to Home Screen option where supported. New releases install their full asset set before becoming eligible for activation. An open app offers **Update & reload**; it does not silently switch data. Previous immutable caches are retained for old open tabs. Clearing site data removes caches and personal saved notes; browsers may also evict storage.

## Material limitations

If an older deployment loaded once and then shows `ERR_FAILED`, first deploy the service-worker redirect fix. In the affected desktop browser, use Ctrl+Shift+R to bypass the old worker for a fresh load, then select **Update & reload** if offered. If the old worker still blocks loading, unregister only this site's service worker in the browser's Application > Service Workers tools, close its open tabs, and reopen the app. Unregistering the worker preserves local saved assessments; clearing all site data would erase them.

1. The CSV’s 1,608 release claims have not received an individual official-source audit. Searchability and simulator rank are not confirmation of release. The interface discloses this.
2. Exact evolution/trade rules are incomplete for `golisopodsh` and four special Pikachu forms. Camerupt’s Mega target is absent from the supported source catalog. Two raid-list Shadow forms cannot be mapped. The retired `golisopodsh` duplicate retains historical stats but no current PvP eligibility. Specific gaps appear in About/Data and the audit file.
3. CSV-only budget raid labels remain unverified unless backed by qualifying GO Hub role ratings. No raid-performance percentile, boss simulator or Max Battle strength estimate is invented.
4. Costume, event and special-form rules can change. Known conditional paths are labeled; gender is respected, and ordinary evolution never creates a Shadow. Purification is not modeled. Cosmetic forms with identical battle stats may share an upstream record; the app explains these collapsed targets.
5. Rankings use the source’s format configuration, not a fresh simulation at your chosen maximum level. Ideal stat product does not optimize every matchup, breakpoint or charge-move priority tie. Minimum-level overrides need maintenance; the default all-IV pool intentionally includes theoretical acquisition-impossible spreads.
6. Install prompts and storage retention vary by browser. Chrome desktop emulation was verified; physical iOS/Android devices remain a useful follow-up.

Optional follow-ups: more official release evidence, manually reviewed budget raid options, copy-specific move inputs, import/export of saved assessments, localization, and physical-device testing. The app’s geometric icon is original. Artwork and form sprites load from [PokeAPI sprites](https://github.com/PokeAPI/sprites); shiny colors and Shadow effects are not shown, and unsupported named forms show an unavailable message. Artwork remains subject to its respective owners' rights and is not relicensed by this project's MIT license. Pictures require network access or the browser's existing image cache; missing images do not prevent offline calculations.

## Source structure

```text
src/lib/             calculator, graph/recommendation rules, search, storage, data integrity
src/worker/          cancellable worker jobs and distribution caching
src/components/      selector, result cards, source explanations
src/App.tsx          assessment / saved notes / data screens
scripts/             source import, validation, offline build, independent comparison
data/                raw snapshots, manual rules, audit reports
public/              immutable browser data, install icons, manifest, hosting headers
tests/               unit and browser tests
docs/                validation results and verified screenshots
dist/                production output (regenerated; not source controlled)
```

### Top 50 browser

The top navigation includes Top 50 with Great, Ultra and Master League lists ordered by the bundled PvPoke rankings. Each card includes the selected form picture, recommended fast and charged moves with Elite/legacy labels, and ideal IVs. GL/UL ideals are calculated in a background worker at level 50 maximum, without Best Buddy, using the full 0-15 IV pool and each form's minimum level. Tied best stat-product spreads remain available. These are theoretical ideals, not encounter guarantees or matchup-specific recommendations; ML and raids use 15/15/15.

Raids uses the existing verified GO Hub move sets, excludes Normal and tiers below A, and offers an attack-type filter. The combined 50-form shortlist sorts by tier, then within-type rank, then type and form ID for deterministic ties; it is not a cross-type DPS ranking or a boss simulation. Alternate, Mega and Shadow forms remain separate. Rankings and moves use the displayed bundled snapshot date; this view does not fetch fresh rankings. Unsupported pictures retain the normal unavailable message and offline calculation still works.

### Raid value through Mega and Primal forms

Assessment follows the sourced evolution graph, so a useful Mega or Primal target also appears for its regular copy and supported earlier stages. Cards label this as **Raid value via Mega / Primal**, display the full path, and preserve Candy, gender, energy, special-move and unlock requirements. The raid tier and suggested moves belong to the target form; the regular species does not inherit the Mega's battle stats or raid rating. Shadow copies cannot enter Mega paths. Collection-wide Top 50 lists keep distinct forms as separate entries.

Staraptor's reviewed link supplements the older game-master templates, using the [official Mega Staraptor announcement](https://pokemongo.com/news/staraptor-super-mega-raid-day-2026). Its Brave Bird+ recommendation includes a reminder to check Mega Level and move availability. Catalog validation rejects useful Mega/Primal targets missing a connection to their regular base; tests cover all 62 currently supported temporary forms and earlier-stage paths.

Top 50 cards also show the earlier evolution names from the catalog graph, including the regular stage before a Mega or Primal transformation. Shadow lineages stay separate. Special evolution branches are marked with conditions; reversible form changes and fusions are not presented as pre-evolutions. Cards without a recorded earlier stage say "No earlier evolution listed."

Raid coverage now comes from the complete GO Hub type-list payloads (including later pages), with **SS, S and A** roles included and Normal excluded. Each form retains every qualifying attacking role, the source tier and within-type rank, limited-move flags, and mixed/off-type labels. The combined Top 50 remains a 50-form shortlist; assessments can recommend every qualifying catalog target. Mega benchmarks and special + move unlock conditions are shown on the cards. Historical snapshots and below-cutoff source rows remain available for audit.

Four additional raid-only Shadow forms have sourced regular-form base stats and gender, while their raid ratings and moves come from GO Hub. Their PvP eligibility and release availability are not inferred. A raid-only refresh can be run with `node scripts/update-moves.mjs --raids-only`, followed by `npm run data:update -- --offline`; this preserves the pinned PvP data and its retrieval date. Unmatched qualifying forms or incomplete type coverage stop the source capture before it replaces the current source pointer.

The repeated ideal-IV field is omitted for Master League and raids, and Top 50 raid/ML cards omit best-IV blocks. Assessments retain the copy's actual overall IV percentage and the existing preference rule; ML also retains its stat-product rank, percentile and battle stats. GL/UL ideal IV displays are unchanged.

### Max Battles in Top 50

The **Max Battles** category displays up to five GO Hub attackers per Max Move type, including Normal, filtered to **A tier and above** (SS, S+, S, A+, A). Dynamax, Gigantamax and special Max Battle forms remain distinct. The October 15 raw top-five capture retains 70 forms and 88 roles; the filtered Top 50 category recommends 53 forms and 66 roles. Poison has three listed options. A type filter shows source order, tiers, recommended Fast Attack, Max Attack, limited-access flags.

The Attacker list measures damage under GO Hub's default level-50 settings. Defender and Healer lists use independent general tiers, described below. Species ratings do not establish a specific copy's Max capability. The Max Battle collection flag continues to preserve collection value independently of the attack-tier cutoff. Gigantamax artwork is mapped separately; ordinary Dynamax enlargement is not depicted. Toxtricity's Max variants retain distinct source identities even where the base battle catalog shares a record.

Run `npm run max:update` to capture all 18 Max type lists and both support guides, then regenerate the catalog. Captures and source hashes are retained in the compressed source bundle. The browser catalog retains the unfiltered top-five capture plus all A-or-better roles from the full type lists; filtering recommendations does not delete source information. Use `node scripts/update-max.mjs --offline` followed by `npm run data:update -- --offline` to rebuild those sets from saved captures without changing their retrieval dates. Ordinary raid and PvP snapshots are preserved. Complete Max coverage is validated before the app pointer changes, and recommendations remain available offline after the updated build is cached.

### Max Battle value in Useful paths

Assessments include a separate **Max Battles** role for GO Hub A-tier-or-better targets, following the existing evolution graph and its gender, regional, event and random-outcome restrictions. All qualifying roles from the full type lists are eligible, including ranks below fifth place: the October 15 snapshot has **57 attacker forms and 73 A-or-better attack roles**. Top 50 still limits each type to its top five before applying the tier cutoff. Source tiers below A remain available for audit.

Dynamax paths from earlier stages are potential roles for a copy that already has the matching Max capability. Gigantamax targets are shown only on the matching species itself; no evolution path is invented from an ordinary or Dynamax copy to Gigantamax. Shadows and Mega/Primal forms do not inherit Max ratings. Shared base-catalog forms, such as Toxtricity, still require confirmation of the exact Max variant.

Cards show the full path, qualifying type roles, source ranks, suggested Fast and Max Attacks, limited-move labels and capability requirements. Sourced Max role tiers have no IV cutoff here; the copy's overall IV percentage remains visible. These options request capability review and cannot independently produce a Keep or Transfer verdict from the species rating alone. The existing collection flag can still preserve any Max-capable copy for collection value.

### Max defenders and healers

Max Battles now offers **All roles / Attacker / Defender / Healer** filters in Top 50. GO Hub's [Max Defenders](https://pokemongohub.net/post/guide/max-defenders-tier-list/) and [Max Healers](https://pokemongohub.net/post/guide/max-healers-tier-list-june-2025/) guides supply independent support tiers. Only A and above qualify, with no five-entry cap on the support lists. The October 15 capture includes **seven defender species/forms and nine healer species across ten forms** (Dynamax and Gigantamax Lapras remain distinct). Combined Useful paths cover 66 distinct Max forms with 90 attack/support roles; multiple roles share one card for the same form.

Defender cards show source-listed fast move alternatives and resistances, Max Guard guidance, source dates and a boss-dependent note. Suggested fast moves are checked against the pinned PvPoke move pool; Elite/event and legacy flags are preserved. Unknown move availability is labeled instead of inferred. Healer cards show the independent tier and Max Spirit guidance; the healer guide supplies no fast/charged recommendation, so none is invented. The support list is general advice rather than a simulation of the current boss or this copy's healing output.

Earlier stages inherit eligible Dynamax support paths through the existing gender/form-aware graph. Ordinary and Shadow copies do not gain Max capability merely by matching the species; Gigantamax is not created by an evolution path. Ratings remain conditional on the matching copy capability and move unlocks. The Max Battle collection flag keeps its existing independent purpose.

Run `npm run max:support:update` to refresh only support guides and rebuild the catalog, or `npm run max:update` to refresh all Max sources. Offline rebuild: `node scripts/update-max-support.mjs --offline`, then `npm run data:update -- --offline`. The complete guide HTML, source hashes, retrieval times, update dates and below-cutoff rows are kept in the compressed source bundle. The browser receives only validated A-or-better support facts. Existing raid, PvP and attack captures remain unchanged during a support-only refresh.
