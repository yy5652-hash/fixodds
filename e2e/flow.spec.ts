import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
async function mockMapServices(page: Page) {
  await page.route('https://nominatim.openstreetmap.org/**', r=>r.fulfill({json:[{display_name:'Bristol, England, United Kingdom',lat:'51.4545',lon:'-2.5879'}]}));
  await page.route('**/places.json', r=>r.fulfill({json:{built:'2026-11-02',kinds:['Repair cafe','Electronics repair'],places:[
    [51.456,-2.59,'Test Repair Cafe',0,'','node/101','+441234567890','Mo-Fr 09:00-17:00'],
    [51.47,-2.6,'Test Electronics Repair',1,'https://example.org','way/202','',''],
    [40.7,-74,'Too Far Away',1,'','node/303','',''],
  ]}}));
  await page.route('https://tile.openstreetmap.org/**', r=>r.fulfill({body:tile,contentType:'image/png'}));
}
async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
}
async function selectItem(page: Page, query: string, item: string) {
  await page.getByRole('combobox',{name:'What broke?'}).fill(query);
  await page.getByRole('option',{name:item,exact:true}).click();
  await expect(page.locator('.result-card').first()).toBeVisible();
}

test('live odds, aliases, privacy, finder, PNG, ticket QR, log and method',async({page})=>{
  await mockMapServices(page);
  const requests:string[]=[];
  page.on('request',r=>requests.push(decodeURIComponent(r.url())+' '+(r.postData()||'')));
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Broken? See the odds before you replace it.');
  await expect(page.locator('.dataset-total')).toContainText('416,282');
  await expect(page.locator('.dataset-numbers')).toContainText('202,076');
  await expect(page.locator('.dataset-numbers')).toContainText('5,392 t');
  await expect(page.locator('.dataset-numbers')).toContainText('699 t');
  // cmdk alias search, keyboard selection.
  const search=page.getByRole('combobox',{name:'What broke?'});
  await search.fill('MacBook'); await search.press('ArrowDown'); await search.press('Enter');
  await expect(page.locator('.result-card > .eyebrow')).toContainText('Laptop');
  const before=await page.locator('.odds-labels').first().textContent();
  await page.getByRole('button',{name:'Battery or charging',exact:true}).click();
  await expect(page.locator('.odds-labels').first()).not.toHaveText(before!);
  await expect(page.getByRole('button',{name:/Check my repair odds/})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'What moved these odds'})).toBeVisible();
  await expect(page.locator('.moved-list')).toContainText('pp');
  await page.getByLabel(/Or describe it/).fill('private-marker-7291 Der Akku lädt nicht');
  await expect(page.getByRole('button',{name:/Battery or charging/})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.proof')).toContainText('in this band were fixed or repairable');
  await expect(page.getByLabel(/Replacement price/)).toHaveValue('');
  await page.getByLabel(/Replacement price/).fill('200');
  await page.getByLabel(/Repair quote/).fill('20');
  await expect(page.getByText('The quote is within your break-even spend.')).toBeVisible();
  const png=page.waitForEvent('download');
  await page.getByRole('button',{name:'Share this',exact:true}).click();
  const pngDownload=await png;
  expect(pngDownload.suggestedFilename()).toMatch(/\.png$/);
  const bytes=readFileSync((await pngDownload.path())!);
  expect(bytes.subarray(1,4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBe(630);
  await page.getByRole('button',{name:'Find a repairer near me',exact:true}).click();
  await page.getByLabel('Town or place').fill('Bristol');
  await page.getByRole('button',{name:'Search places'}).click();
  await page.getByRole('button',{name:/Bristol, England/}).click();
  await expect(page.getByText('2 mapped places near')).toBeVisible();
  await expect(page.getByRole('link',{name:'+441234567890'})).toHaveAttribute('href','tel:+441234567890');
  await expect(page.getByText('Hours: Mo-Fr 09:00-17:00')).toBeVisible();
  await expect(page.getByRole('link',{name:/Directions/}).first()).toHaveAttribute('href','https://www.openstreetmap.org/directions?to=51.456,-2.59');
  await page.getByRole('button',{name:'What usually stops this repair'}).click();
  const guide=await page.getByRole('link',{name:/Search iFixit guides/}).first().getAttribute('href');
  expect(decodeURIComponent(guide!)).toContain('Laptop');expect(guide).not.toContain('private-marker');
  await page.getByRole('button',{name:'Make a repair ticket',exact:true}).click();
  await expect(page.locator('.ticket-sheet h1')).toHaveText('Laptop');
  await page.getByLabel('Agreed maximum spend').fill('80');
  await page.getByLabel('Quote given').fill('65');
  await page.getByRole('checkbox',{name:'Powers on',exact:true}).check();
  await page.getByLabel('Notes',{exact:true}).fill('Cable included');
  await expect(page.getByRole('img',{name:'QR code to open this repair ticket'})).toBeVisible();
  await page.getByRole('button',{name:'Create share link'}).click();
  const link=await page.getByLabel('Shareable link').inputValue();
  expect(link).toContain('#/ticket?d=');expect(decodeURIComponent(link)).not.toContain('private-marker');
  await page.goto(link);await page.reload();
  await expect(page.getByLabel('Agreed maximum spend')).toHaveValue('80');
  await expect(page.getByLabel('Quote given')).toHaveValue('65');
  await expect(page.getByRole('checkbox',{name:'Powers on',exact:true})).toBeChecked();
  await expect(page.locator('.ticket-notes textarea')).toHaveValue('Cable included');
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.print-agreement')).toBeVisible();
  await expect(page.locator('.print-agreement')).toContainText('80');
  await expect(page.getByRole('img',{name:'QR code to open this repair ticket'})).toBeVisible();
  await expect(page.locator('.site-header')).toBeHidden();
  await page.emulateMedia({media:'screen'});
  await page.getByRole('link',{name:'My log',exact:true}).click();
  await page.getByRole('button',{name:'Save outcome'}).click();
  await expect(page.locator('.log-totals strong').first()).toHaveText('1');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export ORDS CSV'}).click();
  const csv=readFileSync((await (await download).path())!,'utf8');
  expect(csv).toContain('id,data_provider,country,partner_product_category,product_category,product_category_id,brand,year_of_manufacture,product_age,repair_status');
  expect(csv).toContain('"Laptop"');expect(csv).toContain('"Fixed"');
  await page.reload();await expect(page.locator('.log-list')).toContainText('Laptop');
  await page.getByRole('link',{name:'Method',exact:true}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Odds, with the working shown.');
  await expect(page.getByRole('table',{name:/Held-out outcomes by verdict/})).toContainText('Harder repair, check first');
  await expect(page.getByRole('img',{name:/Calibration chart/})).toBeVisible();
  expect(requests.some(r=>r.includes('private-marker-7291'))).toBe(false);
});

test('smoke words and the sparks chip override the live verdict',async({page})=>{
  await page.goto('/');await selectItem(page,'Kettle','Kettle');
  await page.getByLabel(/Or describe it/).fill('smoke and burning');
  await expect(page.getByRole('alert')).toContainText('Stop using it');
  await expect(page.locator('.verdict')).toHaveText('Let a professional assess it.');
  await page.getByLabel(/Or describe it/).fill('');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('button',{name:'Sparks or trips the electrics',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Stop using it');
  await expect(page.locator('.verdict')).toHaveText('Let a professional assess it.');
});

test('390px mobile pages, drawer, groups and embed have no horizontal scroll in both themes',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  for (const theme of ['light','dark']) {
    await page.getByRole('combobox',{name:'Colour theme'}).selectOption(theme);
    await noHorizontalScroll(page);
    await page.getByRole('button',{name:'Laptop',exact:true}).click();
    await expect(page.locator('.mobile-result')).toBeVisible();
    await page.locator('.mobile-result').click();
    await expect(page.getByRole('dialog')).toBeVisible();await noHorizontalScroll(page);
    await page.getByRole('button',{name:'Close result'}).click();
    for (const hash of ['#/result','#/ticket','#/log','#/method','#/groups','#/embed']) {
      await page.evaluate(h=>{location.hash=h;},hash);
      await expect(page.locator('main')).toBeVisible();
      if(hash==='#/result')await expect(page.locator('main .verdict')).toBeVisible();
      if(hash==='#/log')await expect(page.getByRole('heading',{level:1})).toHaveText('My repair log.');
      if(hash==='#/method')await expect(page.locator('.calibration')).toBeVisible();
      if(hash==='#/ticket')await expect(page.locator('.ticket-qr img')).toBeVisible();
      if(hash==='#/groups')await expect(page.getByLabel('Embed code')).toHaveValue(/#\/embed/);
      if(hash==='#/embed') {await expect(page.locator('.site-header')).toHaveCount(0);await expect(page.locator('.site-footer')).toHaveCount(0);await expect(page.getByRole('heading',{level:1})).toBeVisible();}
      await noHorizontalScroll(page);
    }
    await page.evaluate(()=>{location.hash='/';});
    await expect(page.locator('.site-header')).toBeVisible();
  }
});

test('desktop first screen contains both the form and result at 1280x720',async({page})=>{
  await page.setViewportSize({width:1280,height:720});await page.goto('/');
  await expect(page.getByRole('combobox',{name:'What broke?'})).toBeInViewport();
  await expect(page.locator('.dataset-total')).toBeInViewport();
  await page.getByRole('button',{name:'Laptop',exact:true}).click();
  await expect(page.locator('.verdict')).toBeInViewport();
  await expect(page.getByRole('button',{name:'Find a repairer near me',exact:true})).toBeInViewport();
});

test('offline shell and previously visited ticket load after installation',async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'allow',baseURL:'http://127.0.0.1:4391'});
  const page=await context.newPage();
  try {
    await page.goto('/');
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.getByRole('button',{name:'Laptop',exact:true}).click();
    await page.getByRole('button',{name:'Make a repair ticket',exact:true}).click();
    await expect(page.locator('.ticket-qr img')).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    // Item state is intentionally not in storage. The shell still starts offline.
    await expect(page.getByRole('heading',{level:1})).toHaveText('Start with your item.');
    await page.getByRole('link',{name:'Tell us what broke',exact:true}).click();
    await page.getByRole('button',{name:'Laptop',exact:true}).click();
    await page.getByRole('button',{name:'Make a repair ticket',exact:true}).click();
    await expect(page.locator('.ticket-qr img')).toBeVisible();
  } finally {await context.close();}
});
