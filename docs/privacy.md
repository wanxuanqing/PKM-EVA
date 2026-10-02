# Privacy and local storage

PKM-EVA performs assessments in your browser. The current application has no account system, analytics SDK, advertising tracker or assessment-upload endpoint.

Preferences, recent searches and optional saved assessments are stored in localStorage on this browser profile. Calculation distributions are cached in IndexedDB. A service worker caches app files and catalogs for offline use. These records do not automatically sync between devices. Other people using the same browser profile may be able to view saved assessments.

Clear this site's browser storage to remove all local records and offline caches. This also removes saved assessments and preferences; it cannot be undone by PKM-EVA. Merely uninstalling a home-screen shortcut or unregistering the service worker may leave storage intact. Browsers can also evict stored data.

Online visits and update checks request app files and catalogs from the hosting provider. These requests expose normal connection metadata, such as IP address, request path and browser headers, to the provider. The checked-in Cloudflare configuration enables persisted observability and invocation logs; actual coverage and retention depend on the deployed service and account settings. This document does not promise zero hosting logs or a specific retention period. See [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).

The app does not send entered IVs, saved assessments or preferences to third-party ranking providers during searches. Opening an external source link visits that provider under its own policies. Data-maintenance scripts fetch source sites when a maintainer explicitly runs an update; those scripts are separate from ordinary app use.

Forks and other deployments may change this behavior. Avoid putting private information in public issue reports or screenshots. Report suspected security problems using the [security policy](../SECURITY.md).
