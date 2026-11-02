import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// 1x1 transparent PNG for map tiles.
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const verdicts = /Repair first|Worth a try|Harder repair, check first/;

async function mockMapServices(page: Page) {
  const requests: string[] = [];
  await page.route('https://nominatim.openstreetmap.org/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ json: [{ display_name: 'Bristol, England, United Kingdom', lat: '51.4545', lon: '-2.5879' }] });
  });
  await page.route('**/places.json', route => route.fulfill({ json: { built: '2026-11-01', kinds: ['Repair cafe', 'Electronics repair'], places: [
    [51.456, -2.59, 'Test Repair Cafe', 0, '', 'node/101'],
    [51.47, -2.6, 'Test Electronics Repair', 1, 'https://example.org', 'way/202'],
    [40.7, -74, 'Too Far Away', 1, '', 'node/303'],
  ] } }));
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ body: tile, contentType: 'image/png' }));
  return requests;
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test('examples to result, ticket, log and method, with map services mocked', async ({ page }) => {
  const services = await mockMapServices(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('finished');

  // Symptoms: typing in any language ticks the matching chip live.
  await page.getByLabel('What is the item?').fill('Kettle');
  await page.getByLabel(/Describe it in your own words/).fill('Der Akku lädt nicht');
  const battery = page.locator('button.chip', { hasText: 'Battery or charging' });
  await expect(battery).toHaveAttribute('aria-pressed', 'true');
  const noHeat = page.locator('button.chip', { hasText: "Doesn't heat" });
  await expect(noHeat).toHaveAttribute('aria-pressed', 'false');
  await noHeat.click();
  await expect(noHeat).toHaveAttribute('aria-pressed', 'true');
  await noHeat.click();
  await expect(noHeat).toHaveAttribute('aria-pressed', 'false');

  // Worked example sets symptoms and goes straight to the result.
  await expect(page.getByRole('button', { name: /^Laptop/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Laptop/ }).click();
  await expect(page).toHaveURL(/#\/result$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(verdicts);
  await expect(page.getByRole('img', { name: /Fixed: .*Repairable: .*End of life: / })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What moved these odds' })).toBeVisible();
  await expect(page.locator('.moved-label').first()).toHaveText('Battery or charging');
  await expect(page.getByText(/Held-out check:/)).toBeVisible();
  await expect(page.getByText(/kg CO₂e/).first()).toBeVisible();

  // Optional money section stays blank until the user types prices.
  await expect(page.getByText('Break-even repair spend')).toHaveCount(0);
  await page.getByLabel(/Replacement price/).fill('200');
  await expect(page.getByText('Break-even repair spend')).toBeVisible();

  // Finder: only on click, via mocked Nominatim and a mocked place directory.
  expect(services).toHaveLength(0);
  await page.getByRole('button', { name: 'Find nearby repair help' }).click();
  await page.getByLabel('Town or place').fill('Bristol');
  await page.getByRole('button', { name: 'Search places' }).click();
  await page.getByRole('button', { name: /Bristol, England/ }).click();
  await expect(page.getByText('2 mapped places near')).toBeVisible();
  await expect(page.getByText('Test Repair Cafe')).toBeVisible();
  await expect(page.getByText('Test Electronics Repair')).toBeVisible();
  expect(services.some(u => u.includes('nominatim'))).toBe(true);
  expect(services.every(u => !/battery|akku|laptop/i.test(decodeURIComponent(u)))).toBe(true);

  // Ticket and share link (problem text off by default).
  await page.getByRole('button', { name: /Make a repair ticket/ }).click();
  await expect(page).toHaveURL(/#\/ticket$/);
  await expect(page.getByText('REPAIR TICKET / BRING THIS WITH YOU')).toBeVisible();
  await expect(page.locator('.ticket-sheet h1')).toHaveText('Laptop');
  await expect(page.locator('.ticket-symptoms')).toContainText('Battery or charging');
  await page.getByRole('button', { name: 'Create share link' }).click();
  const link = await page.getByLabel('Shareable link').inputValue();
  expect(link).toContain('#/ticket?d=');
  await page.goto(link);
  await page.reload();
  await expect(page.locator('.ticket-sheet h1')).toHaveText('Laptop');
  await expect(page.locator('.ticket-symptoms')).toContainText('Battery or charging');

  // Log: record an outcome, see totals, export ORDS CSV.
  await page.getByRole('link', { name: 'My repair log', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My repair log.');
  await page.getByLabel('Outcome').selectOption('Fixed');
  await page.getByRole('button', { name: 'Save outcome' }).click();
  await expect(page.getByText(/Outcome added to this log/)).toBeVisible();
  await expect(page.locator('.log-totals strong').first()).toHaveText('1');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export ORDS CSV' }).click();
  const csv = readFileSync((await (await download).path())!, 'utf8');
  expect(csv).toContain('id,data_provider,country,partner_product_category,product_category,product_category_id,brand,year_of_manufacture,product_age,repair_status');
  expect(csv).toContain('"Laptop"');
  expect(csv).toContain('"Fixed"');
  await page.reload();
  await expect(page.locator('.log-list')).toContainText('Laptop');

  // Method: real numbers, band table, calibration chart.
  await page.getByRole('link', { name: 'The method', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Odds, with the working shown.');
  await expect(page.getByRole('table', { name: /Held-out outcomes by verdict/ })).toContainText('Harder repair, check first');
  await expect(page.getByRole('table', { name: /Held-out scores/ })).toContainText('Category + age + brand');
  await expect(page.getByRole('img', { name: /Calibration chart/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Why free-text words are not used/ })).toBeVisible();
  await noHorizontalScroll(page);
});

test('smoke or burning words override the verdict', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('What is the item?').fill('Kettle');
  await page.getByLabel(/Describe it in your own words/).fill('There is a burning smell and sparks');
  await expect(page.locator('button.chip', { hasText: 'Smoke or burning smell' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Check my repair odds/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Let a professional assess it.');
  await expect(page.getByRole('alert')).toContainText('Stop using it');
});

test('a ticked sparks chip alone also raises the safety notice', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('What is the item?').fill('Toaster');
  await page.locator('button.chip', { hasText: 'Sparks or trips' }).click();
  await page.getByRole('button', { name: /Check my repair odds/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Let a professional assess it.');
});

test('mobile width has no horizontal scroll on any page', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: /^Kettle/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(verdicts);
  await noHorizontalScroll(page);
  for (const hash of ['#/ticket', '#/log', '#/method']) {
    await page.evaluate(h => { location.hash = h; }, hash);
    await page.waitForTimeout(150);
    await noHorizontalScroll(page);
  }
});
