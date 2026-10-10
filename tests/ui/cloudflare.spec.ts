import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

test('Cloudflare HTML redirects survive repeat visits, reopening and offline use', async ({
  page,
  context,
}) => {
  const root = resolve('dist');
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      // Cloudflare canonicalizes this path; Vite preview does not.
      if (url.pathname === '/index.html') {
        res.writeHead(307, { Location: '/' });
        res.end();
        return;
      }
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webmanifest': 'application/manifest+json',
      };
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': types[extname(path)] ?? 'text/plain',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port');
    const url = `http://127.0.0.1:${address.port}/`;
    await page.goto(url);
    await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saved = await page.evaluate(() => localStorage.getItem('pkm-eva:saved'));
    expect(saved).not.toBeNull();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((r) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true }),
        );
    });
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await expect(
        page.getByRole('article', { name: 'Dusclops Great League', exact: true }),
      ).toContainText('#78');
    }
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(url);
    await expect(
      reopened.getByRole('article', { name: 'Dusknoir Ultra League', exact: true }),
    ).toContainText('#154');
    await context.setOffline(true);
    await reopened.reload();
    await expect(
      reopened.getByRole('article', { name: 'Dusclops Great League', exact: true }),
    ).toContainText('#78');
    expect(await reopened.evaluate(() => localStorage.getItem('pkm-eva:saved'))).toBe(saved);
    await reopened.close();
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
