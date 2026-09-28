import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map(async (e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      ),
    )
  ).flat();
}
const assets = (await files('dist')).filter(
  (f) => !f.endsWith('/sw.js') && !['/_headers', '/_redirects'].some((s) => f.endsWith(s)),
);
const hash = createHash('sha256');
for (const path of assets.sort()) {
  hash.update(path);
  hash.update(await readFile(path));
}
const version = hash.digest('hex').slice(0, 16);
const list = assets.map((f) => `/${f.slice(5)}`);
const sw = `// Generated from the complete production build. Never combine app/data versions.
const CACHE = 'pkm-eva-${version}';
const ASSETS = ${JSON.stringify(list)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // Wait for user-directed activation when an older app is open.
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
  // Retain previous immutable caches for other open tabs. Browser eviction / clear-site-data
  // can reclaim them. Deleting old caches here can break an older tab's lazy assets.
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match('/index.html', {ignoreVary: true})).then(r => r || fetch(event.request)));
    return;
  }
  // These same-origin immutable assets do not vary by Origin. Module scripts send
  // an Origin header that the install request may omit (Vite serves Vary: Origin).
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request, {ignoreVary: true})) || (await caches.match(event.request, {ignoreVary: true})) || fetch(event.request)));
});
`;
await writeFile('dist/sw.js', sw);
console.log(`Offline build ${version}: precached ${assets.length} files.`);
