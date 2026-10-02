# Security policy

Security fixes target the latest version on the default branch. Older releases and offline installations do not have a separate backport guarantee. Install offered updates to receive fixes.

## Report privately

Use GitHub's [Report a vulnerability](https://github.com/wanxuanqing/PKM-EVA/security/advisories/new) when available. Include affected app/data versions, reproduction steps, impact and a minimal proof of concept. Do not include live tokens or other people's data.

Private reporting must be enabled by the repository owner. If the link is unavailable, open a public issue asking only for a private security contact, without vulnerability details, exploit code or credentials. Wait for a private route before sharing sensitive information. No response-time or bounty commitment is offered.

Ordinary ranking disagreements and data corrections belong in regular issues unless they expose a security vulnerability.

## Credentials and fixes

The static app requires no runtime secrets. Keep Cloudflare deployment credentials in Cloudflare's managed integration or an appropriate secret store. Never embed secrets in browser code; Vite-exposed environment variables are public build output.

If a credential is exposed, revoke or rotate it first, then assess access and remove it from the working tree and relevant history. Deleting the file or adding it to `.gitignore` does not undo exposure. Coordinate history rewrites with collaborators; forks and caches may retain copies.

CI scans fetched Git history and tracked content with Gitleaks, including supported archives. A clean scan is not proof that every possible credential has been detected. Keep GitHub secret scanning and push protection enabled as an additional layer.
