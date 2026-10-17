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

test('two valid IV digits advance focus without skipping invalid or single digits', async ({
  page,
}) => {
  await page.goto('/');
  const attack = page.getByLabel('Attack', { exact: true });
  const defense = page.getByLabel('Defense', { exact: true });
  const hp = page.getByLabel('HP', { exact: true });
  await attack.fill('');
  await attack.pressSequentially('1');
  await expect(attack).toBeFocused();
  await attack.pressSequentially('5');
  await expect(defense).toBeFocused();
  await page.keyboard.type('09');
  await expect(defense).toHaveValue('09');
  await expect(hp).toBeFocused();
  await page.keyboard.type('15');
  await expect(hp).toBeFocused();
  await expect(hp).toHaveValue('15');
  await attack.fill('99');
  await expect(attack).toBeFocused();
  await expect(attack).toHaveAttribute('aria-invalid', 'true');
});

test('species pictures change with selection and fail gracefully', async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/PokeAPI/sprites/**', (route) =>
    route.request().url().endsWith('/25.png')
      ? route.abort()
      : route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"><circle cx="72" cy="72" r="50"/></svg>',
        }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('img', { name: 'Standard species artwork for Pokédex #355' }),
  ).toBeVisible();
  await search(page, 'Pikachu');
  await expect(page.getByText('Picture unavailable offline or from source.')).toBeVisible();
  await stable(page);
  await search(page, 'Duskull');
  await expect(
    page.getByRole('img', { name: 'Standard species artwork for Pokédex #355' }),
  ).toBeVisible();
});
test('regional artwork follows form changes and resets a failed picture for the same dex', async ({
  page,
}) => {
  await page.route('https://raw.githubusercontent.com/PokeAPI/sprites/**', (route) =>
    route.request().url().endsWith('/713.png')
      ? route.abort()
      : route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"/>',
        }),
  );
  await page.goto('/');
  await search(page, 'Avalugg');
  await page.getByLabel('Form', { exact: true }).selectOption('avalugg');
  await expect(page.getByText('Picture unavailable offline or from source.')).toBeVisible();
  await page.getByLabel('Form', { exact: true }).selectOption('avalugg_hisuian');
  const image = page.getByRole('img', {
    name: 'Form artwork for Avalugg (Hisuian)',
    exact: true,
  });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /\/10243\.png$/);
  for (const [name, id, number] of [
    ['Typhlosion', 'typhlosion_hisuian', '10233'],
    ['Growlithe', 'growlithe_hisuian', '10229'],
  ]) {
    await search(page, name);
    await page.getByLabel('Form', { exact: true }).selectOption(id);
    await expect(
      page.getByRole('img', { name: `Form artwork for ${name} (Hisuian)`, exact: true }),
    ).toHaveAttribute('src', new RegExp(`/${number}\\.png$`));
  }
});
test('percentile default upgrades once while preserving later custom preferences', async ({
  page,
}) => {
  await page.goto('/');
  await stable(page);
  await page.getByText('Level & comparison settings', { exact: true }).click();
  await expect(page.getByLabel('PvP percentile threshold')).toHaveValue('95');
  await page.evaluate(() =>
    localStorage.setItem('pkm-eva:preferences', JSON.stringify({ threshold: 90 })),
  );
  await page.reload();
  await stable(page);
  await page.getByText('Level & comparison settings', { exact: true }).click();
  await expect(page.getByLabel('PvP percentile threshold')).toHaveValue('95');
  await page.getByLabel('PvP percentile threshold').fill('90');
  await stable(page);
  await page.reload();
  await stable(page);
  await page.getByText('Level & comparison settings', { exact: true }).click();
  await expect(page.getByLabel('PvP percentile threshold')).toHaveValue('90');
});
test('gym defenders get a separate role and keep advice without an IV cutoff', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await search(page, 'Chansey');
  await stable(page);
  await expect(page.getByText('Useful for gym defense.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Gym Defense/ }).click();
  const card = page.getByRole('article', { name: 'Chansey Gym Defense', exact: true });
  await expect(card).toContainText('S tier');
  await expect(card).toContainText('No minimum IV percentage');
  await expect(card).not.toContainText('IV rank');
  await card.getByText('Details & requirements', { exact: true }).click();
  await expect(card.getByRole('link', { name: 'GO Hub gym-defense tiers' })).toBeVisible();
  await noOverflow(page);
  await page.reload();
  await search(page, 'Chansey');
  await stable(page);
  await expect(
    page.getByRole('article', { name: 'Chansey Gym Defense', exact: true }),
  ).toBeVisible();
});
async function noOverflow(page: Page) {
  const dims = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dims.scroll).toBeLessThanOrEqual(dims.width);
}
test('expanded raid moves retain type roles and export the same catalog datasheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/');
  await search(page, 'chandelure');
  await page.getByLabel('Form', { exact: true }).selectOption('chandelure');
  await stable(page);
  const card = page.getByRole('article', { name: 'Chandelure Raids', exact: true });
  await card.getByText('Details & requirements').click();
  await expect(card).toContainText('Hex');
  await expect(card).toContainText('Shadow Ball');
  await expect(card).toContainText('ghost · A tier');
  await expect(card).not.toContainText('Fire Spin');
  await expect(card).not.toContainText('Overheat');
  await expect(card.getByRole('link', { name: 'Raid evidence' })).toHaveAttribute(
    'href',
    'https://db.pokemongohub.net/pokemon-list/best-per-type/ghost',
  );
  await noOverflow(page);
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Moves datasheet' })).toBeVisible();
  const link = page.getByRole('link', { name: 'Download moves datasheet (JSON)' });
  const url = await link.getAttribute('href');
  const response = await page.request.get(url!);
  expect(response.ok()).toBe(true);
  const sheet = await response.json();
  expect(
    sheet.rows.some(
      (r: { id: string; role: string; attackingType: string; includedInApp: boolean }) =>
        r.id === 'chandelure' &&
        r.role === 'Raid' &&
        r.attackingType === 'ghost' &&
        r.includedInApp,
    ),
  ).toBe(true);
  await noOverflow(page);
});
test('Nidoran, costume and Mega gender controls follow the selected form', async ({ page }) => {
  await page.goto('/');
  await stable(page);
  await page.getByText('Level & comparison settings', { exact: true }).click();
  const gender = page.getByRole('combobox', { name: 'Gender', exact: true });
  for (const [query, id, expected] of [
    ['nidoran male', 'nidoran_male', 'male'],
    ['nidoran female', 'nidoran_female_shadow', 'female'],
    ['gallade', 'gallade_mega', 'male'],
    ['mewtwo', 'mewtwo_mega_x', 'genderless'],
    ['pikachu libre', 'pikachu_libre', 'female'],
  ]) {
    await search(page, query);
    await page.getByLabel('Form', { exact: true }).selectOption(id);
    await expect(gender).toHaveValue(expected);
    await expect(gender).toBeDisabled();
  }
  await search(page, 'golisopod');
  await page.getByLabel('Form', { exact: true }).selectOption('golisopodsh');
  await expect(
    page.getByText('Gender is unverified for this exact catalog form.', { exact: false }),
  ).toBeVisible();
});
for (const width of [360, 390, 430, 1280])
  test(`phone/desktop layout and calculator at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await stable(page);
    const card = page.getByRole('article', { name: 'Dusclops Great League', exact: true });
    await expect(card).toContainText('#78');
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
  await expect(card).toContainText('#78');
  await page.getByLabel('Current level', { exact: true }).fill('');
  await page.getByLabel('Best Buddy boost').check();
  await stable(page);
  await expect(page.getByText('Effective maximum: level 51')).toBeVisible();
  await search(page, 'ralts');
  await stable(page);
  await page.getByRole('combobox', { name: 'Gender', exact: true }).selectOption('female');
  await stable(page);
  await expect(
    page.getByRole('article', { name: 'Dynamax Gallade Max Battles', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Gender', exact: true }).selectOption('male');
  await stable(page);
  await expect(
    page.getByRole('article', { name: 'Dynamax Gallade Max Battles', exact: true }),
  ).not.toHaveCount(0);
});
test('ML and raids share an explicit IV-sum preference without losing ML ranks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/');
  await search(page, 'mewtwo');
  await page.getByLabel('Form', { exact: true }).selectOption('mewtwo');
  await page.getByLabel('Paste all three IVs').fill('15/15/14');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await stable(page);
  const ml = page.getByRole('article', { name: 'Mewtwo Master League', exact: true });
  const raid = page.getByRole('article', { name: 'Mewtwo Raids', exact: true });
  for (const card of [ml, raid]) {
    await expect(card.getByText('Ideal IVs', { exact: true })).toHaveCount(0);
    await expect(card).toContainText('97.8%');
    await expect(card).toContainText('overall IVs strictly above 90%');
    await expect(card).toContainText('Meets preference');
  }
  await expect(ml).toContainText('Stat-product percentile');
  await expect(ml).toContainText('99.93%');
  await expect(ml).toContainText('IV rank (stat product)');
  await ml.getByText('Details & requirements').click();
  await expect(ml).toContainText('99.479%');
  await noOverflow(page);
});

test('gender-specific forms synchronize controls and older saved assessments', async ({ page }) => {
  await page.goto('/');
  await search(page, 'oinkologne');
  await page.getByLabel('Form', { exact: true }).selectOption('oinkologne_female');
  await page.getByText('Level & comparison settings', { exact: true }).click();
  const gender = page.getByRole('combobox', { name: 'Gender', exact: true });
  await expect(gender).toHaveValue('female');
  await expect(gender).toBeDisabled();
  await stable(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('pkm-eva:saved')!);
    saved[0].settings.gender = 'male';
    localStorage.setItem('pkm-eva:saved', JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('button', { name: /Saved/ }).click();
  await page.getByRole('button', { name: 'Open assessment' }).click();
  await page.getByText('Level & comparison settings', { exact: true }).click();
  await expect(gender).toHaveValue('female');
  await expect(gender).toBeDisabled();
  await page.getByLabel('Form', { exact: true }).selectOption('oinkologne');
  await expect(gender).toHaveValue('male');
  await search(page, 'jellicent');
  await expect(gender).toBeEnabled();
  await gender.selectOption('female');
  await expect(
    page.getByText('Male and female appearances share this battle record:', { exact: false }),
  ).toBeVisible();
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

test('alternate forms keep distinct images and unsupported costumes do not borrow the base picture', async ({
  page,
}) => {
  await page.route('https://raw.githubusercontent.com/PokeAPI/sprites/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"/>',
    }),
  );
  await page.goto('/');
  for (const [name, forms] of [
    [
      'Shaymin',
      [
        ['shaymin_land', '492'],
        ['shaymin_sky', '10006'],
        ['shaymin_land', '492'],
      ],
    ],
    [
      'Giratina',
      [
        ['giratina_altered', '487'],
        ['giratina_origin', '10007'],
      ],
    ],
    [
      'Charizard',
      [
        ['charizard_mega_x', '10034'],
        ['charizard_mega_y', '10035'],
      ],
    ],
  ] as const) {
    await search(page, name);
    for (const [id, number] of forms) {
      await page.getByLabel('Form', { exact: true }).selectOption(id);
      await expect(page.locator('.pokemon-picture img')).toHaveAttribute(
        'src',
        new RegExp(`/${number}\\.png$`),
      );
    }
  }
  await search(page, 'Pikachu');
  await page.getByLabel('Form', { exact: true }).selectOption('pikachu_flying');
  await expect(page.getByText('Picture unavailable for this form.')).toBeVisible();
  await expect(page.locator('.pokemon-picture img')).toHaveCount(0);
  await page.getByLabel('Form', { exact: true }).selectOption('pikachu');
  await expect(page.locator('.pokemon-picture img')).toHaveAttribute('src', /\/25\.png$/);
});

test('Top 50 lists league ideals, moves and type-specific raid shortlists on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://raw.githubusercontent.com/PokeAPI/sprites/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"/>',
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Top 50', exact: true }).click();
  const cards = page.locator('.top-card');
  await expect(cards).toHaveCount(50);
  await expect(cards.first()).toContainText('PvPoke #1');
  await expect(cards.first().getByLabel('Evolution line')).toContainText('Meltan → Melmetal');
  await expect(page.locator('.top-evolution')).toHaveCount(50);
  await expect(cards.first().locator('.top-ivs')).toHaveText(/Best IVs: \d+ \/ \d+ \/ \d+/);
  await expect(cards.first()).toContainText('Elite TM');
  await expect(cards.first().locator('img')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/top50-mobile.png' });
  const accessibility = await new AxeBuilder({ page }).include('.top-pokemon').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'docs/screenshots/top50-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Ultra League', exact: true }).click();
  await expect(cards).toHaveCount(50);
  await expect(cards.first().locator('.top-ivs')).toHaveText(/Best IVs: \d+ \/ \d+ \/ \d+/);
  await page.getByRole('button', { name: 'Master League', exact: true }).click();
  await expect(page.locator('.top-ivs')).toHaveCount(0);
  await page.getByRole('button', { name: 'Raids', exact: true }).click();
  await expect(cards).toHaveCount(50);
  await expect(cards.first()).toContainText('Type rank #');
  await expect(page.locator('.top-ivs')).toHaveCount(0);
  await page.getByLabel('Attack type').selectOption('fire');
  const charizard = page.getByRole('article', { name: 'Charizard (Mega Y)', exact: true });
  await expect(charizard.getByLabel('Evolution line')).toContainText(
    'Charmander → Charmeleon → Charizard → Charizard (Mega Y)',
  );
  await expect(cards.first()).toContainText('fire');
  await expect(page.locator('.top-raid-set strong').filter({ hasNotText: 'fire' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Assess', exact: true }).click();
  await expect(page.getByLabel('Attack', { exact: true })).toHaveValue('1');
});

test('Mega raid value appears from Starly, Staravia and Staraptor with the full path and requirements', async ({
  page,
}) => {
  await page.goto('/');
  for (const name of ['Starly', 'Staravia', 'Staraptor']) {
    await search(page, name);
    await stable(page);
    const card = page.getByRole('article', { name: 'Staraptor (Mega) Raids', exact: true });
    await expect(card).toBeVisible();
    await expect(card).toContainText('RAID VALUE VIA MEGA / PRIMAL');
    await expect(card).toContainText(`${name} →`);
    await card.getByText('Details & requirements').click();
    await expect(card).toContainText('Mega Level');
    await expect(card).toContainText('Gust');
    await expect(card).toContainText('Brave Bird+');
    await expect(card).toContainText('IVs');
  }
  await search(page, 'Starly');
  await page.getByLabel('Form', { exact: true }).selectOption('starly_shadow');
  await stable(page);
  await expect(
    page.getByRole('article', { name: 'Staraptor (Mega) Raids', exact: true }),
  ).toHaveCount(0);
});

test('Rillaboom exposes separate tiered raid and PvP moves and earlier evolution recommendations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await search(page, 'Rillaboom');
  await stable(page);
  const raid = page.getByRole('article', { name: 'Rillaboom Raids', exact: true });
  await expect(raid).toContainText('S tier');
  await expect(raid.getByText('Ideal IVs', { exact: true })).toHaveCount(0);
  await raid.getByText('Details & requirements').click();
  await expect(raid).toContainText('grass · S tier · Type rank #14');
  await expect(raid).toContainText('Razor Leaf');
  await expect(raid).toContainText('Frenzy Plant *');
  const pvp = page.getByRole('article', { name: 'Rillaboom Ultra League', exact: true });
  await pvp.getByText('Details & requirements').click();
  await expect(pvp).toContainText('Drum Beating');
  await expect(pvp).toContainText('Earth Power');
  await noOverflow(page);
  await page.screenshot({ path: 'docs/screenshots/rillaboom-raid-tiers.png' });
  await search(page, 'Grookey');
  await stable(page);
  await expect(page.getByRole('article', { name: 'Rillaboom Raids', exact: true })).toBeVisible();
});

test('Max Battles shows top five per type with distinct forms, correct moves and offline data', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('https://raw.githubusercontent.com/PokeAPI/sprites/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"/>',
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Top 50', exact: true }).click();
  await page.getByRole('button', { name: 'Max Battles', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Max Battle recommendations', exact: true }),
  ).toBeVisible();
  expect(await page.locator('.max-card').count()).toBeGreaterThan(50);
  await page.getByLabel('Max attack type').selectOption('grass');
  await expect(page.locator('.max-card')).toHaveCount(3);
  await expect(page.getByRole('article', { name: 'Dynamax Leafeon', exact: true })).toHaveCount(0);
  const gmax = page.getByRole('article', { name: 'Gigantamax Rillaboom', exact: true });
  const dmax = page.getByRole('article', { name: 'Dynamax Rillaboom', exact: true });
  await expect(gmax).toContainText('G-Max Drum Solo');
  await expect(gmax).toContainText('grass · #1');
  await expect(dmax).toContainText('Max Overgrowth');
  await expect(dmax).toContainText('Razor Leaf');
  await expect(gmax.locator('img')).not.toHaveAttribute('src', /\/812\.png$/);
  await expect(page.locator('.max-card .top-ivs')).toHaveCount(0);
  await noOverflow(page);
  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Max Battle recommendations"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: 'docs/screenshots/max-battles-mobile.png' });
  await page.getByLabel('Max attack type').selectOption('poison');
  await expect(page.locator('.max-card')).toHaveCount(3);
  await expect(
    page.getByText('Only 3 options are listed for poison.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Max attack type').selectOption('fighting');
  await expect(
    page.getByRole('article', { name: 'Gigantamax Machamp', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('article', { name: 'Dynamax Machamp', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await noOverflow(page);
  await page.screenshot({ path: 'docs/screenshots/max-battles-desktop.png' });
  await page.waitForFunction(
    async () => !!(await navigator.serviceWorker.getRegistration())?.active,
  );
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Top 50', exact: true }).click();
  await page.getByRole('button', { name: 'Max Battles', exact: true }).click();
  await page.getByLabel('Max attack type').selectOption('grass');
  await expect(
    page.getByRole('article', { name: 'Gigantamax Rillaboom', exact: true }),
  ).toContainText('G-Max Drum Solo');
});

test('Useful paths includes A-or-better Max evolutions and copy capability conditions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('https://raw.githubusercontent.com/PokeAPI/sprites/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"/>',
    }),
  );
  await page.goto('/');
  await search(page, 'Grookey');
  await stable(page);
  await page
    .getByRole('group', { name: 'Filter roles' })
    .getByRole('button', { name: /^Max Battles/ })
    .click();
  const card = page.getByRole('article', { name: 'Dynamax Rillaboom Max Battles', exact: true });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Grookey → Thwackey → Rillaboom');
  const moves = card.getByRole('region', { name: 'Dynamax Rillaboom suggested Max attacks' });
  await expect(moves).toBeHidden();
  await card.getByText('Details & requirements').click();
  await expect(moves).toBeVisible();
  await expect(moves.locator('dt')).toContainText([
    'Fast move',
    'Max Attack',
    'Fast move',
    'Max Attack',
  ]);
  await expect(moves.getByText('Attacker · A tier', { exact: true })).toHaveCount(0);
  await expect(card).toContainText('grass · A tier · Type rank #3');
  await expect(card).toContainText('Max Overgrowth');
  await expect(card).toContainText('Check Max capability');
  await expect(
    page.getByRole('article', { name: 'Gigantamax Rillaboom Max Battles', exact: true }),
  ).toHaveCount(0);
  await expect(card).toContainText('Ordinary copies do not gain Max capability through evolution.');
  await noOverflow(page);
  const a11y = await new AxeBuilder({ page }).include('.role-Max').analyze();
  expect(a11y.violations).toEqual([]);
  await card.screenshot({ path: 'docs/screenshots/max-useful-path-mobile.png' });
  await search(page, 'Rillaboom');
  await stable(page);
  await page
    .getByRole('group', { name: 'Filter roles' })
    .getByRole('button', { name: /^Max Battles/ })
    .click();
  await expect(
    page.getByRole('article', { name: 'Gigantamax Rillaboom Max Battles', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Dynamax Rillaboom Max Battles', exact: true }),
  ).toBeVisible();
  await search(page, 'Bounsweet');
  await stable(page);
  await page
    .getByRole('group', { name: 'Filter roles' })
    .getByRole('button', { name: /^Max Battles/ })
    .click();
  await expect(page.locator('.role-Max')).toHaveCount(0);
  await expect(page.getByText('No Max Battles options here.', { exact: true })).toBeVisible();
});

test('Max defender and healer roles have separate tiers, paths, move labels and offline lists', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('https://raw.githubusercontent.com/PokeAPI/sprites/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"/>',
    }),
  );
  await page.goto('/');
  await search(page, 'Wailmer');
  await stable(page);
  await page
    .getByRole('group', { name: 'Filter roles' })
    .getByRole('button', { name: /^Max Battles/ })
    .click();
  const wailord = page.getByRole('article', { name: 'Dynamax Wailord Max Battles', exact: true });
  await expect(wailord).toContainText('Healer · A tier');
  await expect(wailord).toContainText('Wailmer → Wailord');
  await expect(wailord).toContainText('Max Spirit');
  await expect(wailord).toContainText('Check Max capability');
  await expect(
    wailord.getByRole('region', { name: 'Dynamax Wailord Healer recommendation' }),
  ).toBeHidden();
  await wailord.getByText('Details & requirements').click();
  await expect(
    wailord.getByRole('region', { name: 'Dynamax Wailord Healer recommendation' }),
  ).toBeVisible();
  await noOverflow(page);
  await wailord.screenshot({ path: 'docs/screenshots/max-healer-useful-path.png' });
  await search(page, 'Beldum');
  await stable(page);
  const metagross = page.getByRole('article', {
    name: 'Dynamax Metagross Max Battles',
    exact: true,
  });
  await metagross.getByText('Details & requirements').click();
  await expect(metagross).toContainText('Defender · A tier');
  await expect(metagross).toContainText('Beldum → Metang → Metagross');
  await expect(metagross).toContainText('Fury Cutter');
  await expect(metagross).toContainText('Shadow Claw · Elite / event move');
  await page.getByRole('button', { name: 'Top 50', exact: true }).click();
  await page.getByRole('button', { name: 'Max Battles', exact: true }).click();
  const roles = page.getByRole('group', { name: 'Max Battle role' });
  await roles.getByRole('button', { name: 'Healer', exact: true }).click();
  await expect(page.locator('.max-card')).toHaveCount(10);
  await expect(page.getByLabel('Max attack type')).toHaveCount(0);
  const blissey = page.getByRole('article', { name: 'Dynamax Blissey', exact: true });
  await expect(blissey).toContainText('Healer · S tier');
  await expect(blissey).toContainText('Max Spirit');
  await expect(blissey).not.toContainText('Defender');
  await expect(page.getByRole('article', { name: 'Dynamax Chansey', exact: true })).toHaveCount(0);
  await noOverflow(page);
  const a11y = await new AxeBuilder({ page })
    .include('[aria-label="Max Battle recommendations"]')
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.screenshot({ path: 'docs/screenshots/max-healers-mobile.png' });
  await roles.getByRole('button', { name: 'Defender', exact: true }).click();
  await expect(page.locator('.max-card')).toHaveCount(7);
  const registeel = page.getByRole('article', { name: 'Dynamax Registeel', exact: true });
  await expect(registeel).toContainText('Defender · S tier');
  await expect(registeel).toContainText('Lock-On / Metal Claw');
  await expect(registeel).toContainText('Max Guard');
  await expect(registeel).toContainText('depends on the boss');
  await expect(page.getByRole('article', { name: 'Dynamax Blissey', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await noOverflow(page);
  await page.screenshot({ path: 'docs/screenshots/max-defenders-desktop.png' });
  await roles.getByRole('button', { name: 'All roles', exact: true }).click();
  const crown = page.getByRole('article', { name: 'Crowned Shield Zamazenta', exact: true });
  await expect(crown).toHaveCount(1);
  await expect(crown).toContainText('Attacker');
  await expect(crown).toContainText('Defender · S tier');
  await page.waitForFunction(
    async () => !!(await navigator.serviceWorker.getRegistration())?.active,
  );
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Top 50', exact: true }).click();
  await page.getByRole('button', { name: 'Max Battles', exact: true }).click();
  await page
    .getByRole('group', { name: 'Max Battle role' })
    .getByRole('button', { name: 'Healer', exact: true })
    .click();
  await expect(page.getByRole('article', { name: 'Dynamax Blissey', exact: true })).toContainText(
    'Healer · S tier',
  );
  await page.getByRole('button', { name: 'Assess', exact: true }).click();
  await search(page, 'Wailmer');
  await stable(page);
  await expect(
    page.getByRole('article', { name: 'Dynamax Wailord Max Battles', exact: true }),
  ).toContainText('Healer · A tier');
});

test('PvP useful paths include rank 100 and exclude rank 101 in every league', async ({ page }) => {
  await page.goto('/');
  for (const [name, form, target, league, included] of [
    ['Talonflame', 'talonflame_shadow', 'Talonflame (Shadow)', 'Great League', true],
    ['Wigglytuff', '', 'Wigglytuff', 'Great League', false],
    ['Sylveon', '', 'Sylveon', 'Ultra League', true],
    ['Hippowdon', '', 'Hippowdon', 'Ultra League', false],
    ['Kommo-o', '', 'Kommo-o', 'Master League', true],
    ['Kartana', '', 'Kartana', 'Master League', false],
  ] as const) {
    await search(page, name);
    if (form) await page.getByLabel('Form', { exact: true }).selectOption(form);
    await stable(page);
    const card = page.getByRole('article', { name: target + ' ' + league, exact: true });
    if (included) {
      await expect(card).toBeVisible();
      await expect(card).toContainText('Species #100');
    } else await expect(card).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(
    page.getByText('ranks 1–100 qualify in GL, UL and ML; rank 101 does not.', { exact: false }),
  ).toBeVisible();
});
