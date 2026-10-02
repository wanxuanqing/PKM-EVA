# Maintenance and releases

PKM-EVA is maintained as time permits. There is no guaranteed support response, data refresh interval or service availability. Rankings and game mechanics can change between snapshots. The app's Data screen reports source dates and versions; consult the README's calculation rules and material limitations before acting on advice. Source corrections should include evidence as described in CONTRIBUTING.md.

## Repository settings

See the [pre-release security check](security-audit.md) for the initial scan scope, results and pending owner settings.

The following are GitHub account settings, not settings that a committed YAML file can activate:

- Enable secret scanning and push protection in repository Settings > Security (the exact navigation may vary).
- Enable private vulnerability reporting so SECURITY.md's private report link works.
- Enable Dependabot alerts and security updates. The checked-in Dependabot configuration also proposes weekly npm and GitHub Actions version updates.
- After the first successful Actions run, protect `main` with a ruleset requiring a pull request and the build/data and secret-scan checks. Use the check names shown by that run. Do not require an approving reviewer unless another maintainer is available.
- Keep deployment tokens in the Cloudflare integration or service secrets. The checked-in workflows need no Cloudflare token.

## Checks and deployment

Checks run on pull requests, pushes to `main`, manual dispatch and release tags through the reusable workflow. They validate formatting, data, the gender audit, unit tests, production build, browser tests and secrets. Source downloads and catalog refreshes are intentionally excluded from normal builds. Actions are pinned to commit hashes; review Dependabot updates. Gitleaks is separately pinned by version and archive SHA-256; update both together after checking the upstream release.

Cloudflare deployment remains managed by its existing Git integration. GitHub Actions do not deploy the app, and a GitHub release is not a deployment. Protecting `main` helps ensure merged code passed checks; Cloudflare itself may start builds independently of Actions.

## Versioned release procedure

1. Review outstanding limitations and third-party redistribution permissions, especially for bundled data. Passing CI does not grant those rights.
2. On a release branch, update package.json and package-lock.json together with `npm version patch --no-git-tag-version` (or choose minor/major). Add concise user-facing notes to CHANGELOG.md, including changed data versions and relevant limitations. Submit and merge after checks pass.
3. From the reviewed commit on `main`, create a matching tag, for example `git tag -a v0.1.1 -m "PKM-EVA v0.1.1"`, then `git push origin v0.1.1`. Substitute the actual package version; the workflow rejects mismatches.
4. The tag workflow reruns checks and creates a **draft** GitHub release with generated notes. Review those notes, copy the relevant changelog entry, identify prerequisites or limitations, and publish when ready. It does not upload a deployable build or automatically publish the release. GitHub provides source archives for published tags.
5. Confirm the separate Cloudflare deployment and check mobile layout, an online reload, offline reload and the app's explicit update prompt. Record the deployed commit and catalog version in release notes.

Do not move a published tag. Issue a new version for corrections. If a draft run fails, fix the cause and rerun as appropriate; if the draft already exists, edit it in GitHub rather than creating a duplicate.
