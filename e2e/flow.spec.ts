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
  await page.route('https://www.ifixit.com/api/**', r=>r.fulfill({json:{results:[{dataType:'guide',guideid:7,title:'Laptop Battery Replacement',url:'https://www.ifixit.com/Guide/Laptop+Battery/7',difficulty:'Easy',time_required_max:900,username:'Tester',category:'PC Laptop',image:null}]},headers:{'access-control-allow-origin':'*'}}));
  const soon=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  await page.route('**/events.json', r=>r.fulfill({json:{built:'2026-11-04',events:[[1,soon+'T10:00:00+00:00',soon+'T13:00:00+00:00','Europe/London','Autumn repair cafe','Hall, Bristol',51.46,-2.59,'Test Repair Cafe',0,'United Kingdom'],[2,soon+'T10:00:00+00:00','','Europe/London','Far','NYC',40.7,-74,'Far Cafe',0,'United States']]}}));
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
  await expect(page.getByText('Below this illustrative limit')).toBeVisible();
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
  await expect(page.getByText('2 mapped places near')).toBeVisible();
  await expect(page.getByRole('link',{name:'+441234567890'})).toHaveAttribute('href','tel:+441234567890');
  await expect(page.getByText(/(Open now \(your device's time\)|Closed now) · Mo-Fr 09:00-17:00/)).toBeVisible();
  await page.getByRole('button',{name:'Ask about this repair'}).first().click();
  const message=await page.getByLabel(/Your message/).inputValue();
  expect(message).toContain('#/ticket?s=');expect(message).not.toContain('private-marker');
  await expect(page.getByRole('link',{name:'WhatsApp'})).toHaveAttribute('href',/^https:\/\/wa\.me\/441234567890\?text=/);
  await expect(page.getByRole('link',{name:'Text message'})).toHaveAttribute('href',/^sms:\+441234567890\?&body=/);
  await page.getByLabel('Within').first().selectOption('100');
  await expect(page.getByText('2 mapped places near')).toBeVisible();
  await expect(page.getByRole('link',{name:/Directions/}).first()).toHaveAttribute('href','https://www.openstreetmap.org/directions?to=51.456,-2.59');
  await page.getByRole('button',{name:'What usually stops this repair'}).click();
  const guide=await page.getByRole('link',{name:/Search iFixit guides/}).first().getAttribute('href');
  expect(decodeURIComponent(guide!)).toContain('laptop');expect(guide).not.toContain('private-marker');
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
  await page.getByRole('link',{name:'My repairs',exact:true}).click();
  await page.getByRole('button',{name:'Track my laptop repair'}).click();
  await page.getByLabel('Where').fill('Test Repair Cafe');
  await page.getByLabel('Appointment').fill('2030-01-05T10:30');
  await expect(page.locator('.stepper [aria-current="step"]')).toContainText('Booked');
  const visit=page.waitForEvent('download');await page.getByRole('button',{name:'Add appointment to calendar'}).click();
  expect(readFileSync((await (await visit).path())!,'utf8')).toContain('SUMMARY:Repair: Laptop at Test Repair Cafe');
  await page.getByRole('button',{name:'Record the outcome'}).click();
  await page.getByLabel('Repair warranty ends').fill('2099-01-01');
  await page.getByRole('button',{name:'Save outcome'}).click();
  await expect(page.locator('.job')).toHaveCount(0);
  await expect(page.locator('.log-list')).toContainText('Test Repair Cafe');
  await expect(page.locator('.warranty')).toContainText('until 2099-01-01');
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

test('three routes, iFixit guides and nearby repair events with calendar files',async({page})=>{
  await mockMapServices(page);
  await page.goto('/');
  await page.evaluate(()=>localStorage.setItem('fixodds-area-v1',JSON.stringify({lat:51.4545,lon:-2.5879,name:'Bristol, England'})));
  await page.reload();
  await selectItem(page,'MacBook','Laptop');
  await page.getByRole('button',{name:'Battery or charging'}).click();
  await expect(page.getByRole('heading',{name:'Pick the route that fits.'})).toBeVisible();
  await expect(page.getByRole('link',{name:/Laptop Battery Replacement/})).toHaveAttribute('href','https://www.ifixit.com/Guide/Laptop+Battery/7');
  await expect(page.locator('.route').filter({hasText:'Free repair cafe'})).toContainText('Test Repair Cafe');
  await expect(page.locator('.route.is-best')).toHaveCount(1);
  await page.getByRole('link',{name:'Repair events',exact:true}).click();
  await expect(page.getByText('1 upcoming within 25 km of Bristol, England')).toBeVisible();
  await expect(page.getByText('Far Cafe')).toHaveCount(0);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Add to calendar'}).click();
  const file=readFileSync((await (await download).path())!,'utf8');
  expect(file).toContain('BEGIN:VEVENT');expect(file).toContain('SUMMARY:Test Repair Cafe: Autumn repair cafe');expect(file).toContain('TRIGGER:-PT1440M');
  await noHorizontalScroll(page);
});

test('item repair records, brand comparison and a check started from an item page',async({page})=>{
  await mockMapServices(page);
  await page.goto('/#/items');
  await page.getByRole('link',{name:/^Vacuum/}).click();
  await expect(page.getByRole('heading',{name:'Vacuum',level:1})).toBeVisible();
  await expect(page.getByRole('table',{name:'Outcomes by brand'}).getByText('Dyson')).toBeVisible();
  await expect(page.getByText('Spare parts are the usual blocker.')).toBeVisible();
  await page.getByRole('link',{name:'Check my vacuum'}).click();
  await expect(page.locator('.result-card').first()).toContainText('Vacuum');
  await page.getByRole('button',{name:'Sharpen the odds'}).click();
  await page.getByLabel('Brand').fill('Dyson');
  await expect(page.locator('.brand-line')).toContainText('Dyson Vacuum: fixed in');
  await page.getByRole('button',{name:'Battery or charging'}).click();
  await expect(page.getByRole('heading',{name:'Real repairs like yours'})).toBeVisible();
  await expect(page.locator('.case-list li').first()).toBeVisible();
  await noHorizontalScroll(page);
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
    for (const hash of ['#/result','#/ticket','#/log','#/method','#/groups','#/embed','#/events','#/items','#/item/vacuum']) {
      await page.evaluate(h=>{location.hash=h;},hash);
      await expect(page.locator('main')).toBeVisible();
      if(hash==='#/result')await expect(page.locator('main .verdict')).toBeVisible();
      if(hash==='#/log')await expect(page.getByRole('heading',{level:1})).toHaveText('My repairs.');
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

test('German and Chinese mobile interface keeps search and Vacuum example working',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await mockMapServices(page);
  await page.goto('/');
  for(const language of [
    {name:'Deutsch',code:'de',nav:['Prüfen','Reparatur-Termine','Reparaturdaten','Meine Reparaturen','Methode','Für Gruppen'],search:'Was ist kaputt?',laptop:'Laptop',vacuum:'Staubsauger'},
    {name:'简体中文',code:'zh',nav:['检测','维修活动','维修统计','我的维修','计算方法','面向组织'],search:'什么坏了？',laptop:'笔记本电脑',vacuum:'吸尘器'},
  ]) {
    await page.getByRole('combobox',{name:'Language',exact:true}).selectOption({label:language.name});
    await expect(page.locator('html')).toHaveAttribute('lang',language.code);
    await expect(page.locator('.site-header nav a')).toHaveText(language.nav);
    await noHorizontalScroll(page);
    const search=page.getByRole('combobox',{name:language.search,exact:true});
    await search.fill('MacBook');
    await page.getByRole('option',{name:language.laptop,exact:true}).click();
    await expect(page.locator('.result-card > .eyebrow')).toContainText(language.laptop);
    await page.getByRole('button',{name:language.vacuum,exact:true}).click();
    await expect(search).toHaveValue(language.vacuum);
    await expect(page.locator('.result-card > .eyebrow')).toContainText(language.vacuum);
    await expect(page.locator('.odds-labels').first()).not.toContainText('Fixed');
    await noHorizontalScroll(page);
    await page.reload();
    await expect(page.getByRole('combobox',{name:'Language',exact:true})).toHaveValue(language.code);
    await expect(page.locator('.site-header nav a')).toHaveText(language.nav);
    await noHorizontalScroll(page);
  }
});

test('saved next steps persist, enquiry links require confirmation and Repairable remains open',async({page})=>{
  await mockMapServices(page);
  await page.goto('/'); await selectItem(page,'MacBook','Laptop');
  await page.getByLabel('What were you planning to do?').selectOption('replace');
  await page.locator('.route').filter({hasText:'Paid repairer'}).getByRole('button',{name:'Make this my next step'}).click();
  await expect(page.locator('.next-step')).toContainText('Your next step: Ask a repairer for a diagnosis and quote');
  await page.getByRole('button',{name:'Find and message a repairer'}).click();
  await page.getByLabel('Town or place').fill('Bristol'); await page.getByRole('button',{name:'Search places'}).click();
  await page.getByRole('button',{name:'Ask about this repair'}).first().click();
  const email=page.getByRole('link',{name:'Email',exact:true});
  // Avoid launching the host mail app; still run the actual React click handler.
  await email.evaluate(a=>a.addEventListener('click',e=>e.preventDefault()));
  await email.click(); await expect(page.locator('.enquiry')).toContainText('Enquiry sent?');
  await page.locator('.enquiry').getByRole('button',{name:'Not yet',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixodds-jobs-v1')!)[0].stage)).toBe('Planned');
  await email.click(); await page.locator('.enquiry').getByRole('button',{name:'Yes, I sent it'}).click();
  await page.locator('.next-step').getByRole('link',{name:'Open tracker'}).click();
  await expect(page.locator('.stepper [aria-current="step"]')).toContainText('Enquiry sent');
  await expect(page.getByLabel('What were you planning to do?')).toHaveValue('replace');
  await page.getByRole('button',{name:'Record the outcome'}).click();
  await page.getByRole('combobox',{name:'Outcome',exact:true}).selectOption('Repairable');
  await page.getByRole('button',{name:'Save outcome'}).click();
  await expect(page.locator('.job')).toContainText('Order or ask about the part');
  await expect(page.locator('.stepper [aria-current="step"]')).toContainText('Waiting for parts');
  await expect(page.locator('.log-totals strong').first()).toHaveText('0');
  await page.reload(); await expect(page.locator('.job')).toContainText('Order or ask about the part');
  await page.getByRole('button',{name:'Record the outcome'}).click();
  await page.getByLabel('Repair date',{exact:true}).fill('2026-01-01');
  await page.getByLabel('Did this postpone or cancel buying a new one?').selectOption('yes');
  await page.getByRole('button',{name:'Save outcome'}).click();
  await expect(page.locator('.job')).toHaveCount(0);
  await page.getByLabel('Still working?').selectOption('yes');
  await expect(page.locator('.log-totals strong').nth(1)).toHaveText('1');
  await expect(page.locator('.log-totals strong').nth(2)).toHaveText('1');
  const download=page.waitForEvent('download'); await page.getByRole('button',{name:'Export pilot CSV'}).click();
  const csv=readFileSync((await (await download).path())!,'utf8');
  expect(csv).toContain('purchase_postponed,still_working,checked_on'); expect(csv).toContain('"replace","Fixed","yes","yes"');
  await page.reload(); await expect(page.locator('.log-list')).toContainText('Still working: Yes');
});

test('event warnings, booking priority and unknown-item saved appointments',async({page})=>{
  await mockMapServices(page);
  const soon=new Date(Date.now()+3*86400000).toISOString();
  await page.route('**/events.json',r=>r.fulfill({json:{built:'2026-11-04',events:[[9,soon,'','Europe/London','FULL — cancelled repair cafe','Hall',51.46,-2.59,'Test Repair Cafe',0,'United Kingdom','Booking required']]}}));
  await page.goto('/#/events');
  await expect(page.locator('.event-status')).toHaveText(['FULL','Cancelled','Booking required']);
  await expect(page.locator('.event-list .primary')).toHaveText('Details and booking');
  await expect(page.getByRole('button',{name:'Add anyway'})).toBeVisible();
  await expect(page.getByText(/Events snapshot updated/)).toBeVisible();
  await page.getByRole('button',{name:'Make this my next step'}).click();
  await page.getByRole('link',{name:'Open tracker'}).click();
  await expect(page.locator('.job')).toContainText('Unknown item');
  await expect(page.getByLabel('Appointment')).not.toHaveValue('');
  await expect(page.locator('.stepper [aria-current="step"]')).toContainText('Planned');
  await page.reload(); await expect(page.locator('.job')).toContainText('Test Repair Cafe');
  await expect(page.locator('.job').getByRole('link',{name:'Details and booking'})).toHaveAttribute('href','https://restarters.net/party/view/9');
});

test('saved cafe step uses the current item and completing the step does not report a fixed repair',async({page})=>{
  await mockMapServices(page); await page.goto('/'); await selectItem(page,'MacBook','Laptop');
  await page.getByRole('link',{name:'Repair events',exact:true}).click();
  await page.locator('.event-list li').first().getByRole('button',{name:'Make this my next step'}).click();
  await page.getByRole('link',{name:'Check',exact:true}).click();
  await expect(page.locator('.next-step')).toContainText('Your next step: Test Repair Cafe,');
  await page.locator('.next-step').getByRole('button',{name:'Mark step done'}).click();
  await expect(page.locator('.next-step')).toContainText('Step marked done.');
  await page.locator('.next-step').getByRole('link',{name:'Open tracker'}).click();
  await expect(page.locator('.job')).toContainText('Laptop');
  await expect(page.locator('.log-totals strong').first()).toHaveText('0');
});
