import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const search = async (page: Page, name: string) => {
  await page.getByRole('combobox', { name: 'Pokémon name' }).fill(name);
  await page.getByRole('combobox', { name: 'Pokémon name' }).press('Enter');
};
const stable = async (page: Page) => {
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
};
async function noOverflow(page: Page) {
  const dims = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dims.scroll).toBeLessThanOrEqual(dims.width);
}
for (const width of [360, 390, 430, 1280])
  test(`phone/desktop layout and calculator at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await stable(page);
    const card = page.getByRole('article', { name: 'Dusclops Great League', exact: true });
    await expect(card).toContainText('#61');
    await expect(card).toContainText('98.53%');
    await noOverflow(page);
    await card.getByText('Details & requirements').click();
    await expect(card).toContainText('1,493 / 44.5');
    await noOverflow(page);
    await page.screenshot({ path: `docs/screenshots/assessment-${width}.png`, fullPage: true });
    if (width === 390) await page.screenshot({ path: 'docs/screenshots/phone-viewport.png' });
    await search(page, 'zygarde complete');
    await stable(page);
    await noOverflow(page);
    await page.getByRole('button', { name: 'Data', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Catalog audit' })).toBeVisible();
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
test('accessible controls, text contrast, expanded details, and source explanations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await stable(page);
  await page.getByText('Level & comparison settings', { exact: true }).click();
  await page.getByText('Collection & copy details', { exact: true }).click();
  await page
    .getByRole('article', { name: 'Dusclops Great League', exact: true })
    .getByText('Details & requirements')
    .click();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  expect(
    (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    ).violations.map((v) => v.id),
  ).toEqual([]);
});
test('a corrupt or mixed-version catalog produces a clear error', async ({ page }) => {
  await page.route('**/data/catalog-*.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.version = 'incorrect-version';
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('different version');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
test('a complete update waits for explicit reload and then activates', async ({ page }) => {
  const root = resolve('dist');
  let next = false;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let body = await readFile(file);
      if (path === '/sw.js' && next)
        body = Buffer.from(
          body.toString().replace("const CACHE = 'pkm-eva-", "const CACHE = 'pkm-eva-update-test-"),
        );
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webmanifest': 'application/manifest+json',
      };
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
    if (!address || typeof address === 'string') throw new Error('No test server port.');
    let navigations = 0;
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) navigations++;
    });
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await stable(page);
    await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible();
    next = true;
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      await r.update();
    });
    await expect(page.getByRole('button', { name: 'Update & reload' })).toBeVisible();
    expect(navigations).toBe(1);
    expect(
      await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
    ).toBe(true);
    await page.getByRole('button', { name: 'Update & reload' }).click();
    await page.waitForEvent('load');
    await stable(page);
    expect(navigations).toBe(2);
    await expect(page.getByRole('button', { name: 'Update & reload' })).toHaveCount(0);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test('keyboard search, forms, malformed IVs, saved notes and collection flags', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await stable(page);
  const input = page.getByRole('combobox', { name: 'Pokémon name' });
  await input.fill('no-such-pokemon');
  await expect(page.getByText('No matches. Try')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
  await input.fill('shadow duskull');
  await input.press('Enter');
  await stable(page);
  await expect(page.getByRole('heading', { name: 'Duskull (Shadow)', exact: true })).toBeVisible();
  await page.getByLabel('Form', { exact: true }).selectOption('duskull');
  await stable(page);
  await page.getByLabel('Attack', { exact: true }).fill('16');
  await expect(page.getByText('Enter a whole number')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await page.getByLabel('Paste all three IVs').fill('1/12/13');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await stable(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Saved/ }).click();
  await expect(page.getByRole('heading', { name: 'Duskull', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Saved/ }).click();
  await page.getByRole('button', { name: 'Open assessment' }).click();
  await stable(page);
  await page.getByText('Collection & copy details', { exact: true }).click();
  await page.getByLabel('Shiny', { exact: true }).check();
  await expect(page.locator('.verdict')).toContainText('There’s more to this copy.');
  await noOverflow(page);
});
test('advanced settings preserve theoretical ranks and separate regional branches', async ({
  page,
}) => {
  await page.goto('/');
  await stable(page);
  await page.getByText('Level & comparison settings', { exact: true }).click();
  await page.getByLabel('Current level', { exact: true }).fill('50');
  await stable(page);
  const card = page.getByRole('article', { name: 'Dusclops Great League', exact: true });
  await expect(card).toContainText('Already over the cap');
  await expect(card).toContainText('#61');
  await page.getByLabel('Current level', { exact: true }).fill('');
  await page.getByLabel('Best Buddy boost').check();
  await stable(page);
  await expect(page.getByText('Effective maximum: level 51')).toBeVisible();
  await search(page, 'ralts');
  await stable(page);
  await page.getByRole('combobox', { name: 'Gender', exact: true }).selectOption('female');
  await stable(page);
  await expect(
    page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Gallade', exact: true }) }),
  ).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Gender', exact: true }).selectOption('male');
  await stable(page);
  await expect(
    page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Gallade', exact: true }) }),
  ).not.toHaveCount(0);
});
test('production caches complete assets and calculations survive offline reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await stable(page);
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((r) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true }),
      );
  });
  await context.setOffline(true);
  await page.reload();
  await stable(page);
  await expect(
    page.getByRole('article', { name: 'Dusknoir Ultra League', exact: true }),
  ).toContainText('#154');
  await search(page, 'eevee');
  await stable(page);
  await expect(page.getByRole('heading', { name: 'Eevee', exact: true })).toBeVisible();
  await noOverflow(page);
  await context.setOffline(false);
});
