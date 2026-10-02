# Contributing to PKM-EVA

Bug reports, source-backed data corrections, documentation and focused pull requests are welcome. For larger features, open an issue describing the user need before investing in implementation. Keep discussion respectful and explain disagreements with evidence.

## Development

Use Node.js 24 and the committed lockfile. Run `npm ci`, then `npm run dev`. On Windows PowerShell, use `npm.cmd` and `npx.cmd` if script execution policy blocks the shims. No API keys are needed.

Before submitting:

```sh
npm run format:check
npm run data:validate
npm run audit:gender
npm test
npm run build
npm run test:ui
```

Local browser tests use installed Google Chrome. CI installs Playwright Chromium and starts a fresh production preview. Run `npm run format` to fix formatting. Include meaningful regression coverage for changes to calculations, evolution rules, storage or offline behavior. The separate `npm run validate:independent` check downloads a pinned reference calculator; use it when changing calculator mathematics and review its report.

## Data corrections

Include the exact species/form ID, league or raid type, source URL, source commit or retrieval date, expected result and supporting evidence. Distinguish Shadow and gender-specific battle forms. A simulator entry is not proof that a form is released in Pokémon GO.

Keep data refreshes separate from calculation changes where practical. Use `npm run moves:update` for move enrichment or follow the full refresh instructions in the README. Regeneration from bundled inputs uses `npm run data:update -- --offline`. Review changed rankings, move flags, evolution paths, exclusions, source hashes and audit reports. Preserve the supplied CSV, its original claims and previously published immutable snapshots. Do not manually patch generated catalogs to conceal an import problem.

Do not add third-party content without checking redistribution permission and retaining required attribution. The app's MIT license does not relicense someone else's material.

## Pull requests and reports

Describe the problem, resulting behavior, validation performed and remaining limitations. For UI changes, include relevant mobile behavior. Bug reports should include app/data version, browser, reproduction steps, expected and actual results; omit private saved notes and credentials.

Report vulnerabilities privately using [SECURITY.md](SECURITY.md), not public issues. Never commit environment files, deployment tokens, private keys or unredacted logs. Maintainers review contributions as time permits; acceptance and response times are not guaranteed. Original code contributions are submitted under the repository's MIT license.
