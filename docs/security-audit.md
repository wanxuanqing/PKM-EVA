# Pre-release security check

Checked on 2026-10-01, before committing the open-source preparation changes.

## Scope and results

- The local checkout is not shallow and had nine reachable commits across local refs. Gitleaks 8.30.1 scanned all local refs with `git . --log-opts=--all`, reporting eight scanned commits and no leaks.
- A separate scan copied tracked working files and non-ignored new files to an isolated directory and scanned them with `gitleaks dir`. No leaks were found. Both scans enabled redaction, supported archive expansion to depth three and decoding to depth two; each processed about 68 MB.
- A history filename check found no environment files, private-key files or credential-named files matching the checked patterns. `.gitignore` excludes environment files, local Cloudflare state, logs, temporary research files and dependencies. The scanner, temporary copies and redacted reports remain in ignored `.work/security/`.
- The Windows scanner archive was downloaded from the official Gitleaks v8.30.1 release and matched its published SHA-256 checksum. CI pins the corresponding Linux archive version and checksum.
- All 58 unit/data tests, 16 browser tests, formatting, data validation, gender audit and production build passed. Actionlint 1.7.12 accepted the workflows; optional external shellcheck/pyflakes integrations were disabled for this local validation. Hosted GitHub Actions execution is still pending a push.

This is a bounded automated scan, not a guarantee that no credential exists. It covers local refs and current project files, not unfetched remote refs, deleted unreachable Git objects, GitHub issues, attachments, deployment logs or provider account secrets. No credential rotation or history rewrite was indicated by these results or performed.

## Pending owner settings

GitHub's settings page was signed out in the available browser. Secret scanning, push protection, private vulnerability reporting, Dependabot alerts/security updates and branch rules have not been verified or changed remotely. Complete the settings checklist in [releases.md](releases.md). These settings cannot be activated by committing the workflow files alone.
