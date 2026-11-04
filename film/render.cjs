// Renders the FixOdds film frame by frame: the real built site runs in an iframe on a stage page,
// page time is stepped by hand, so slow camera moves stay smooth and text stays sharp at any zoom.
// node film/render.cjs <landscape|portrait> <out.mp4> [--fps N] [--from S --to S]
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(ROOT + '/node_modules/@playwright/test');
const FF = process.env.FF || path.resolve(ROOT, '../revoice-2026-10-24/bin/ffmpeg');
const mode = process.argv[2] || 'landscape', out = process.argv[3] || 'film/work/test.mp4';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : d; };
const FPS = arg('fps', 30), PORTRAIT = mode === 'portrait';
const [W, H] = PORTRAIT ? [1080, 1920] : [1920, 1080];
const [AW, AH] = PORTRAIT ? [480, 690] : [1440, 810];

const narration = Object.fromEntries(JSON.parse(fs.readFileSync(__dirname + '/narration_v4.json')).map(l => [l.id, l]));
function wavDur(id) {
  const b = fs.readFileSync(`${__dirname}/audio_v2/${id}.wav`);
  const data = b.indexOf('data'); return b.readUInt32LE(data + 4) / (b.readUInt32LE(24) * b.readUInt16LE(34) / 8 * b.readUInt16LE(22));
}
// Scene plan: narration lines, silence before and after. Short version reuses the same takes.
const scenes = PORTRAIT ? [
  ['s01', ['s01'], .25, .5], ['s03', ['s03a', 's03b'], .1, .5], ['s05', ['s05'], .2, .6],
  ['s06', ['s06b', 's06c'], .1, .5], ['s08', ['s08a'], .1, .6],
  ['n09', ['n09a'], .2, .5], ['n10', ['n10'], .3, .6], ['s12', ['s12'], .3, 1.6],
] : [
  ['s01', ['s01'], .25, .6], ['s02', ['s02'], .1, .5], ['s03', ['s03a', 's03b'], .1, .6],
  ['s04', ['s04a', 's04b'], .9, .3], ['s05', ['s05'], .15, 1.0], ['s06', ['s06a', 's06b', 's06c'], .1, .7],
  ['s07', ['s07a', 's07b', 's07c'], .3, .6], ['s08', ['s08a', 's08b', 's08c'], .2, .8],
  ['n09', ['n09a', 'n09b'], .3, .6], ['n10', ['n10'], .3, .6], ['n11', ['n11'], .3, .6], ['n12', ['n12'], .3, .5], ['n13', ['n13'], .3, .5], ['s12', ['s12'], .3, 2.4],
];
const T = {}, lines = {}, caps = [];
let cursor = 0;
for (const [id, ls, lead, tail] of scenes) {
  T[id] = cursor; cursor += lead;
  for (const l of ls) {
    const d = wavDur(l); lines[l] = { t: cursor, d };
    const text = narration[l].cap, max = PORTRAIT ? 56 : 62, chunks = []; let row = '';
    for (const w of text.split(' ')) {
      if ((row + ' ' + w).trim().length > max) {
        const m = [...row.matchAll(/[,:.] /g)].pop();
        if (m && m.index > max * .35) { chunks.push(row.slice(0, m.index + 1)); row = row.slice(m.index + 2) + ' ' + w; } else { chunks.push(row); row = w; }
      } else row = (row + ' ' + w).trim();
    }
    chunks.push(row);
    const total = chunks.reduce((a, c) => a + c.length, 0); let c0 = cursor + .05, span = d - .1;
    for (const c of chunks) { const cd = span * c.length / total; caps.push({ t0: c0, t1: c0 + cd - .02, text: c }); c0 += cd; }
    cursor += d + .28;
  }
  cursor += tail - .28; T[id + '_end'] = cursor;
}
const END = cursor;
fs.writeFileSync(`${__dirname}/work/timeline_${mode}.json`, JSON.stringify({ scenes: T, lines, end: END }, null, 1));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const server = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]); let f;
  if (u === '/stage.html') f = __dirname + '/stage.html';
  else if (u.startsWith('/fonts/')) f = ROOT + '/node_modules/@fontsource-variable/inter/files/' + path.basename(u);
  else if (u.startsWith('/app/')) f = ROOT + '/dist/' + (u.slice(5) || 'index.html');
  if (!f || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark', serviceWorkers: 'block', locale: 'en-GB', acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
  // Map tiles and the place search are kept on disk, so repeat renders do not hit OpenStreetMap again.
  const cacheDir = __dirname + '/work/netcache'; fs.mkdirSync(cacheDir, { recursive: true });
  await ctx.route(/openstreetmap\.org|ifixit\.com/, async route => {
    const key = crypto.createHash('sha1').update(route.request().url()).digest('hex'), p = `${cacheDir}/${key}`;
    if (fs.existsSync(p)) { const m = JSON.parse(fs.readFileSync(p + '.json')); return route.fulfill({ status: 200, contentType: m.type, headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(p) }); }
    const res = await route.fetch(); const body = await res.body();
    if (res.status() === 200) { fs.writeFileSync(p, body); fs.writeFileSync(p + '.json', JSON.stringify({ type: res.headers()['content-type'] })); }
    await route.fulfill({ response: res, body, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-11-04T11:00:00Z') });
  await page.goto(`http://127.0.0.1:${port}/stage.html`);
  await page.evaluate(o => stage.init(o), { portrait: PORTRAIT, w: AW, h: AH, cy: PORTRAIT ? .44 : .5, src: `http://127.0.0.1:${port}/app/index.html`, caps });
  const frameEl = await page.waitForSelector('#app');
  const frame = await frameEl.contentFrame();
  await frame.waitForSelector('.check-form', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await frame.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.clock.pauseAt(new Date('2026-11-04T11:00:10Z'));
  const cdp = await ctx.newCDPSession(page);

  // ---- Direction helpers ----
  const queue = []; const at = (t, fn) => queue.push({ t, fn });
  const rect = sel => frame.evaluate(s => { const el = typeof s === 'string' ? document.querySelector(s) : null; if (!el) throw Error('no ' + s); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
  const textRect = (sel, text) => frame.evaluate(([s, tx]) => { const el = [...document.querySelectorAll(s)].find(e => e.textContent.includes(tx)); if (!el) throw Error('no ' + s + ' ' + tx); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, [sel, text]);
  const clickText = (sel, text) => frame.evaluate(([s, tx]) => { const el = [...document.querySelectorAll(s)].find(e => e.textContent.includes(tx)); if (/INPUT|TEXTAREA/.test(el.tagName)) el.focus(); el.click(); }, [sel, text]);
  const clickSel = sel => frame.evaluate(s => { const el = document.querySelector(s); if (/INPUT|TEXTAREA/.test(el.tagName)) el.focus(); el.click(); }, sel);
  const st = (fn, ...a) => page.evaluate(([f, x]) => stage[f](...x), [fn, a]);
  let scroll = null;
  const scrollTo = (t0, dur, y) => at(t0, async () => { const from = await frame.evaluate(() => scrollY); scroll = { t0, t1: t0 + dur, from, to: y }; });
  const sceneCard = c => st('card', c);
  const clamp = (v, a, b) => a > b ? (a + b) / 2 : Math.min(b, Math.max(a, v));
  const fill = (x, y, s) => ({ s, x: clamp(x, W / 2 / s, AW - W / 2 / s), y: clamp(y, H / 2 / s, AH - H / 2 / s) });
  // App time is paused between frames, so waits must also advance it.
  async function pump(check, arg) { for (let i = 0; i < 500; i++) { if (await frame.evaluate(check, arg)) return; await page.clock.runFor(50); await page.waitForTimeout(25); } throw Error('timed out: ' + arg); }
  const waitSel = sel => pump(s => !!document.querySelector(s), sel);
  const waitTiles = () => pump(() => { const t = [...document.querySelectorAll('.leaflet-tile')]; return t.length > 0 && t.every(i => i.complete); }, 'tiles');
  // Move the pointer to an element and act when it arrives.
  function pointClick(t, dur, get, act) {
    at(t, async () => { const r = await get(); const x = r.x + r.w / 2, y = r.y + r.h / 2; await st('curTo', t, t + dur, x, y); await st('click', t + dur, x, y); });
    at(t + dur, act);
  }
  function typeText(t, text, each = .06) {
    [...text].forEach((ch, i) => at(t + i * each, () => page.keyboard.insertText(ch)));
    return t + text.length * each;
  }
  const count = (from, to, dur = 1.8, delay = 0) => `<span data-from="${from}" data-to="${to}" data-dur="${dur}" data-delay="${delay}">${from}</span>`;

  // ---- Title cards shared by both versions ----
  const tl = l => lines[l].t, te = l => lines[l].t + lines[l].d;
  sceneCard({ t0: T.s01 + .2, t1: tl('s01') + lines.s01.d * .52, html: `<div class="huge">Broken.</div>`, fade: .22 });
  sceneCard({ t0: tl('s01') + lines.s01.d * .54, t1: T.s01_end - .05, html: `<div class="huge">Bin it?</div>`, fade: .22 });
  if (T.s02 !== undefined) sceneCard({ t0: T.s02 + .1, t1: T.s02_end - .05, html: `<div class="big" style="max-width:15em">Nobody tells you<br>the odds.</div>` });
  sceneCard({ t0: T.s03 + .05, t1: tl('s03b') - .1, html: `<div class="huge">${count(0, 416282, Math.min(2.6, lines.s03a.d * .5))}</div><div class="label">${PORTRAIT ? 'real repair attempts' : 'real repair attempts, logged by repair groups'}</div>` });
  sceneCard({ t0: tl('s03b') - .05, t1: T.s03_end - .05, html: `<div id="brand">FixOdds<span class="acc">.</span></div><div class="label">The odds, before you decide.</div>` });
  // Held-out proof
  if (lines.s06a) sceneCard({ t0: T.s06 + .05, t1: tl('s06b') - .08, html: `<div class="big">${count(0, 41047, 1.4)}</div><div class="label">later repairs, from groups it never saw</div><div class="small">Out of time, group-disjoint held-out test</div>` });
  sceneCard({ t0: tl('s06b') - .05, t1: tl('s06c') - .05, html: `<div class="huge fix">87.7%</div><div class="label">“Repair first” band: fixed or repairable</div><div class="small">41,047 held-out attempts</div>` });
  sceneCard({ t0: tl('s06c') - .05, t1: T.s06_end - .05, html: `<div class="row"><div><div class="big fix">87.7%</div><div class="small">Repair first</div></div><div><div class="mid amb">73.5%</div><div class="small">Worth a try</div></div><div><div class="big" style="color:#d8d2c3">60.6%</div><div class="small">Harder repair</div></div></div><div class="small">Fixed or repairable · 41,047 held-out attempts</div>` });
  // Dataset impact, the high point
  const s8split = tl('s08a') + lines.s08a.d * .42;
  sceneCard({ t0: T.s08 + .05, t1: s8split, html: `<div class="huge">${count(150000, 202076, 1.9)}</div><div class="label">recorded fixes</div>` });
  sceneCard({ t0: s8split, t1: T.s08_end - .05, html: `<div class="${PORTRAIT ? '' : 'row'}"><div><div class="big fix">≈5,400 t</div><div class="label">CO₂e</div></div><div ${PORTRAIT ? 'style="margin-top:6vmin"' : ''} data-in="0.7"><div class="big">≈700 t</div><div class="label">e-waste kept in use</div></div></div><div class="small">Same factors, fixes in categories with a factor. What repair already does, not FixOdds' own impact.</div>` });
  // End card
  sceneCard({ t0: T.s12 + .1, t1: 1e9, fade: .5, drift: 0, html: `<div id="brand">FixOdds<span class="acc">.</span></div><div class="mid" style="margin-top:1vmin">Give repair a fair chance.</div><div class="label acc" style="margin-top:4.5vmin">yy5652-hash.github.io/fixodds</div><div class="small" style="margin-top:6vmin">${PORTRAIT ? 'Data: Open Repair Alliance · The Restart Project<br>OpenStreetMap contributors · Guides linked from iFixit<br>Music: Dvořák, Symphony No. 9, Musopen' : 'Data: Open Repair Alliance · The Restart Project · Restarters.net · OpenStreetMap contributors<br>Guides linked from iFixit · Music: Dvořák, Symphony No. 9, Musopen'}</div>` });

  const BRISTOL = { lat: 51.454, lon: -2.597, name: 'Bristol, City of Bristol, England, United Kingdom' };
  const seedArea = () => frame.evaluate(a => { localStorage.setItem('fixodds-area-v1', JSON.stringify(a)); window.dispatchEvent(new Event('fixodds-area')); }, BRISTOL);
  // The saved town lets the cafe route show the next event near Bristol.
  at(T.s04 !== undefined ? T.s04 : T.s03 + .1, seedArea);
  // ---- Interface direction ----
  const hideWin = (t0, dur = .4) => at(t0, () => st('camTo', t0, t0 + dur, { op: 0 }));
  if (!PORTRAIT) {
    // S04 form: float in, then work the form with the result in view.
    at(0, () => st('camSet', { x: 720, y: 405, s: 1.02, rx: 7, ry: -11, op: 0 }));
    const a = T.s04;
    at(a, () => st('camTo', a, a + 1.4, { op: 1, s: 1.16, rx: 3, ry: -5 }));
    at(a + 1.4, () => st('camTo', a + 1.4, a + 3, { s: 1.34, rx: 0, ry: 0, x: 720, y: 405 }));
    at(a + 1.0, async () => { const r = await rect('.item-search input'); await st('curTo', a + 1.0, a + 1.0, r.x + 120, r.y + 200); });
    pointClick(a + 1.05, .55, () => rect('.item-search input'), () => clickSel('.item-search input'));
    const typed = typeText(a + 1.7, 'Laptop', .07);
    pointClick(typed + .05, .4, () => frame.evaluate(() => { const el = [...document.querySelectorAll('[cmdk-item]')].find(e => e.textContent.trim().startsWith('Laptop')); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }), () => frame.evaluate(() => { [...document.querySelectorAll('[cmdk-item]')].find(e => e.textContent.trim().startsWith('Laptop')).click(); }));
    const c1 = typed + .75;
    pointClick(c1, .5, () => textRect('button.chip', 'Battery'), () => clickText('button.chip', 'Battery'));
    pointClick(c1 + .95, .45, () => textRect('button.chip', 'too hot'), () => clickText('button.chip', 'too hot'));
    pointClick(c1 + 1.75, .28, () => textRect('button.chip', 'too hot'), () => clickText('button.chip', 'too hot'));
    const d0 = c1 + 2.25;
    at(d0, async () => { const r = await rect('.check-form textarea'); await st('camTo', d0, d0 + 1.1, fill(r.x + r.w / 2, r.y + r.h / 2 - 20, 1.75)); });
    pointClick(d0 + .1, .5, () => rect('.check-form textarea'), () => clickSel('.check-form textarea'));
    const d1 = typeText(d0 + .75, 'Der Akku lädt nicht mehr', Math.min(.075, (tl('s04b') + 1.0 - (d0 + .75)) / 24));
    at(tl('s04b') + .1, async () => { const r = await rect('.privacy'); await st('ring', { t0: tl('s04b') + .1, t1: T.s04_end + .1, x: r.x - 8, y: r.y - 6, w: r.w + 16, h: r.h + 12 }); });
    // S05 verdict: the music lands here.
    const b = T.s05;
    at(b - .3, async () => { await st('curHide'); await frame.evaluate(() => document.activeElement?.blur?.()); const r = await rect('.result-card'); await st('camTo', b - .3, b + .7, fill(r.x + r.w / 2, r.y + 210, 1.62)); });
    sceneCard({ t0: tl('s05') + lines.s05.d * .22, t1: T.s05_end - .1, cls: 'stamp', rise: 12, style: 'align-items:flex-start', html: `<div class="stampbox" style="margin:27vh 0 0 0"><div class="n">86.4%</div><div class="t">fixed or repairable<br>54.7% fixed + 31.7% more work or parts</div></div>` });
    hideWin(T.s05_end - .3);
    // S07 impact
    const c = T.s07;
    at(c - .05, async () => { const r = await rect('.impact-block'); await st('camSet', { op: 0, s: 1.5, rx: 2, ry: -3, x: r.x + r.w / 2, y: r.y + r.h / 2 }); await st('camTo', c, c + .9, { op: 1, s: 1.95, rx: 0, ry: 0 }); await st('ring', { t0: c + .5, t1: tl('s07c') - .1, x: r.x - 10, y: r.y - 8, w: r.w + 20, h: r.h + 16 }); });
    const s7c = tl('s07c');
    at(s7c - .5, async () => {
      const o = await frame.evaluate(() => { const h = [...document.querySelectorAll('.result-details button')].find(e => e.textContent.includes('How these figures')); h.click(); return { top: h.getBoundingClientRect().top + scrollY, x: h.getBoundingClientRect().x + h.getBoundingClientRect().width / 2 }; });
      await page.clock.runFor(350);
      const tgt = await frame.evaluate(t => Math.min(t, document.documentElement.scrollHeight - innerHeight), o.top - 160);
      scroll = { t0: s7c - .4, t1: s7c + .9, from: await frame.evaluate(() => scrollY), to: tgt };
      await st('camTo', s7c - .4, s7c + .9, fill(o.x, 160 + 170, 1.55));
    });
    at(s7c + .95, async () => {
      const r = await frame.evaluate(() => { const p = [...document.querySelectorAll('.result-details p')].find(e => e.textContent.startsWith('Expected CO')); const b = p.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
      await st('ring', { t0: s7c + 1, t1: T.s07_end - .3, x: r.x - 8, y: r.y - 5, w: r.w + 16, h: r.h + 10 });
      await st('camTo', s7c + 1, T.s07_end, fill(r.x + r.w / 2, r.y + 90, 1.68));
    });
    hideWin(T.s07_end - .3);
    // N09 three routes; the suggested one is ringed.
    const n9 = T.n09, routeView = r => fill(r.x + r.w / 2, r.y + Math.min(r.h, 640) / 2, 1);
    at(n9 - .15, async () => {
      await st('curHide');
      await frame.evaluate(() => { const r = document.querySelector('.routes'); window.scrollTo({ top: r.getBoundingClientRect().top + scrollY - 40, behavior: 'instant' }); });
      await page.clock.runFor(300);
      const r = await rect('.routes'); const v = routeView(r);
      await st('camSet', { op: 0, rx: 3, ry: -5, ...fill(v.x, v.y, 1.3) });
      await st('camTo', n9, n9 + 1.1, { op: 1, rx: 0, ry: 0, ...fill(v.x, v.y, 1.42) });
    });
    at(n9 + 1.15, async () => { const r = await rect('.routes'); await st('camTo', n9 + 1.15, te('n09a'), fill(r.x + r.w / 2, r.y + Math.min(r.h, 640) / 2, 1.55)); });
    sceneCard({ t0: tl('n09a') + 1.2, t1: te('n09a') - .1, cls: 'stamp', rise: 12, html: `<div class="stampbox" style="margin:7vh 6vw 0 0"><div class="n" style="color:#f4f1e9">3</div><div class="t">ways to get it fixed</div></div>` });
    at(tl('n09b') - .15, async () => { const r = await rect('.route.is-best'); await st('ring', { t0: tl('n09b') - .15, t1: T.n09_end - .1, x: r.x - 8, y: r.y - 6, w: r.w + 16, h: r.h + 12 }); await st('camTo', tl('n09b') - .15, T.n09_end, fill(r.x + r.w / 2, r.y + r.h / 2, 1.75)); });
    hideWin(T.n09_end - .25, .25);
    // N10 repair events in Bristol: search, map, one-tap calendar reminder.
    const n10 = T.n10;
    at(n10 - .1, async () => {
      await frame.evaluate(() => { location.hash = '/events'; });
      await waitSel('.events-page .place-form input');
      await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const r = await rect('.events-page .card');
      await st('camSet', { op: 0, rx: 2, ry: 3, ...fill(r.x + r.w / 2, r.y + r.h / 2 - 30, 1.62) });
      await st('camTo', n10, n10 + .7, { op: 1, rx: 0, ry: 0, ...fill(r.x + r.w / 2, r.y + r.h / 2 - 30, 1.72) });
      await st('curTo', n10, n10, r.x + 260, r.y + r.h + 90);
    });
    pointClick(n10 + .2, .4, () => rect('.events-page .place-form input'), () => clickSel('.events-page .place-form input'));
    const typedE = typeText(n10 + .65, 'Bristol, UK', .045);
    pointClick(typedE + .05, .3, () => rect('.events-page .place-form button[type=submit]'), () => clickSel('.events-page .place-form button[type=submit]'));
    at(typedE + .4, async () => {
      await pump(() => !!document.querySelector('.place-choices button') || (!!document.querySelector('.event-list li') && !document.querySelector('.place-form button[disabled]')), 'events');
      if (await frame.evaluate(() => !!document.querySelector('.place-choices button'))) { await frame.evaluate(() => document.querySelector('.place-choices button').click()); await waitSel('.event-list li'); }
      await frame.evaluate(() => document.activeElement?.blur?.()); await st('curHide');
      await waitTiles(); await page.clock.runFor(300);
      const o = await frame.evaluate(() => { const m = document.querySelector('.events-page .map').getBoundingClientRect(); const to = Math.min(m.top + scrollY - 70, document.documentElement.scrollHeight - innerHeight); return { from: scrollY, to, x: m.x + m.width / 2, vy: m.top + scrollY - to, h: m.height }; });
      scroll = { t0: typedE + .4, t1: typedE + 1.4, from: o.from, to: o.to };
      await st('camTo', typedE + .4, typedE + 1.4, fill(o.x, o.vy + o.h / 2 + 80, 1.42));
    });
    const cal = tl('n10') + lines.n10.d * .62;
    at(cal - .7, async () => { const r = await rect('.event-list li'); await st('camTo', cal - .7, cal + .3, fill(r.x + r.w / 2, r.y + r.h / 2 - 120, 1.55)); await st('curTo', cal - .7, cal - .7, r.x + r.w - 300, r.y + 140); });
    pointClick(cal - .45, .4, () => rect('.event-list li button.secondary'), () => clickSel('.event-list li button.secondary'));
    at(cal, async () => { const r = await rect('.event-list li button.secondary'); await st('ring', { t0: cal, t1: T.n10_end - .2, x: r.x - 6, y: r.y - 5, w: r.w + 12, h: r.h + 10 }); });
    sceneCard({ t0: tl('n10') + .1, t1: T.n10_end - .15, cls: 'stamp', rise: 12, html: `<div class="stampbox" style="margin:7vh 6vw 0 0"><div class="n" style="color:#f4f1e9">954</div><div class="t">upcoming repair events<br>reminder the day before</div></div>` });
    hideWin(T.n10_end - .25, .25);
    // N11 finder: open-now filter, then a ready-to-send enquiry.
    const n11 = T.n11;
    at(n11 - .1, async () => {
      await st('curHide');
      await frame.evaluate(() => { location.hash = '/'; });
      await waitSel('.routes button.route-link');
      await frame.evaluate(() => document.querySelector('.routes button.route-link').click());
      await waitSel('.finder .repair-list'); await page.clock.runFor(900);
      await frame.evaluate(() => { const f = document.querySelector('.finder .filter-bar'); window.scrollTo({ top: f.getBoundingClientRect().top + scrollY - 150, behavior: 'instant' }); });
      const r = await rect('.finder .filter-bar');
      await st('camSet', { op: 0, ...fill(r.x + r.w / 2, r.y + 230, 1.42) }); await st('camTo', n11, n11 + .6, { op: 1, ...fill(r.x + r.w / 2, r.y + 230, 1.52) });
      await st('curTo', n11, n11, r.x + r.w / 2, r.y + 260);
    });
    pointClick(n11 + .35, .45, () => textRect('.finder button.chip', 'Open now'), () => clickText('.finder button.chip', 'Open now'));
    const ask = n11 + 1.5;
    at(ask - .1, async () => {
      const o = await frame.evaluate(() => { const all = [...document.querySelectorAll('.finder .repair-list > li')].filter(l => l.querySelector('.ask')); const li = all.find(l => [...l.querySelectorAll('a[href^="tel:"]')].some(a => /^tel:(\+|00)/.test(a.getAttribute('href')))) || all[0]; li.setAttribute('data-film', '1'); const b = li.getBoundingClientRect(); const to = Math.min(b.top + scrollY - 110, document.documentElement.scrollHeight - innerHeight); return { from: scrollY, to, x: b.x + b.width / 2, vy: b.top + scrollY - to }; });
      scroll = { t0: ask - .1, t1: ask + .6, from: o.from, to: o.to };
      await st('camTo', ask - .1, ask + .6, fill(o.x, o.vy + 160, 1.55));
    });
    pointClick(ask + .65, .4, () => rect('li[data-film] .ask'), async () => {
      await clickSel('li[data-film] .ask'); await page.clock.runFor(50);
      // The film serves the build locally; show the ticket link as the live site writes it.
      await frame.evaluate(() => { const ta = document.querySelector('li[data-film] .enquiry textarea'); const v = ta.value.replace(/http:\/\/127\.0\.0\.1:\d+\/app\/index\.html/, 'https://yy5652-hash.github.io/fixodds/'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, v); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    });
    at(ask + 1.15, async () => {
      await page.clock.runFor(150); await st('curHide');
      const o = await frame.evaluate(() => { const e = document.querySelector('li[data-film] .enquiry').getBoundingClientRect(); const to = Math.min(e.top + scrollY - 140, document.documentElement.scrollHeight - innerHeight); return { from: scrollY, to, d: scrollY - to }; });
      scroll = { t0: ask + 1.15, t1: ask + 1.85, from: o.from, to: o.to };
      const r = await rect('li[data-film] .enquiry');
      await st('camTo', ask + 1.15, ask + 1.85, fill(r.x + r.w / 2, r.y + o.d + r.h / 2, 1.6));
      const b = await frame.evaluate(d => { const e = document.querySelector('li[data-film] .enquiry'); const a = e.querySelector('a[href^="https://wa.me"]') || e.querySelector('a[href^="sms:"]') || e.querySelector('a.button'); const r = a.getBoundingClientRect(); return { x: r.x, y: r.y + d, w: r.width, h: r.height }; }, o.d);
      await st('ring', { t0: ask + 1.9, t1: T.n11_end - .2, x: b.x - 6, y: b.y - 5, w: b.w + 12, h: b.h + 10 });
      
    });
    hideWin(T.n11_end - .3);
    // N12 item record: vacuum score, then the brand table.
    const n12 = T.n12;
    at(n12 - .1, async () => {
      await st('curHide');
      await frame.evaluate(() => { location.hash = '/item/vacuum'; });
      await waitSel('.item-hero .item-score'); await page.clock.runFor(300);
      await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const r = await rect('.item-hero');
      await st('camSet', { op: 0, rx: 2, ry: -3, ...fill(r.x + r.w / 2, r.y + r.h / 2, 1.5) });
      await st('camTo', n12, n12 + 1.0, { op: 1, rx: 0, ry: 0, ...fill(r.x + r.w / 2, r.y + r.h / 2, 1.65) });
    });
    const br = tl('n12') + lines.n12.d * .5;
    at(br, async () => {
      const o = await frame.evaluate(() => { const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('By brand')); const c = h.closest('.card').getBoundingClientRect(); const to = Math.min(c.top + scrollY - 60, document.documentElement.scrollHeight - innerHeight); return { from: scrollY, to, x: c.x + c.width / 2, vy: c.top + scrollY - to }; });
      scroll = { t0: br, t1: br + 1.1, from: o.from, to: o.to };
      await st('camTo', br, br + 1.1, fill(o.x, o.vy + 250, 1.45));
    });
    sceneCard({ t0: br + .5, t1: T.n12_end - .1, cls: 'stamp', rise: 12, html: `<div class="stampbox" style="margin:7vh 6vw 0 0"><div class="n" style="color:#f4f1e9">578</div><div class="t">brand records, 95% intervals</div></div>` });
    hideWin(T.n12_end - .25, .25);
    // N13 quick cuts: tracker, then the same result in Chinese and German.
    const n13 = T.n13, cut = (T.n13_end - n13) / 3;
    const moveBtn = () => textRect('.job button', 'Move to:');
    at(n13 - .1, async () => {
      await frame.evaluate(() => { location.hash = '/log'; });
      await waitSel('.log-totals');
      await frame.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.startsWith('Track my')).click());
      await waitSel('.job .stepper');
      await frame.evaluate(() => [...document.querySelectorAll('.job button')].find(x => x.textContent.startsWith('Move to:')).click());
      await page.clock.runFor(100);
      await frame.evaluate(() => { const j = document.querySelector('.job'); window.scrollTo({ top: j.getBoundingClientRect().top + scrollY - 150, behavior: 'instant' }); });
      const r = await rect('.job');
      await st('camSet', { op: 1, rx: 0, ry: 0, ...fill(r.x + r.w / 2, r.y + 110, 1.62) });
      const b = await moveBtn(); await st('curTo', n13, n13, b.x + b.w / 2 + 40, b.y + 90);
    });
    pointClick(n13 + .1, .35, moveBtn, () => frame.evaluate(() => [...document.querySelectorAll('.job button')].find(x => x.textContent.startsWith('Move to:')).click()));
    const lang = (t, code) => at(t, async () => {
      await st('curHide');
      await frame.selectOption('select[aria-label="Language"]', code);
      await frame.evaluate(() => { location.hash = '/'; }); await waitSel('.result-card'); await page.clock.runFor(200);
      await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const r = await rect('.check-layout');
      await st('camSet', { op: 1, ...fill(r.x + r.w / 2, r.y + 300, 1.36) }); await st('camTo', t, t + cut, fill(r.x + r.w / 2, r.y + 300, 1.42));
    });
    lang(n13 + cut, 'zh'); lang(n13 + 2 * cut, 'de');
    sceneCard({ t0: n13 + cut, t1: T.n13_end - .1, cls: 'stamp', rise: 0, html: `<div class="stampbox" style="margin:7vh 6vw 0 0"><div class="n" style="color:#f4f1e9">5</div><div class="t">languages</div></div>` });
    hideWin(T.n13_end - .3);
  } else {
    // Short version: the real phone layout, scaled up.
    at(0, async () => { await st('camSet', { x: AW / 2, y: AH / 2, s: 2, rx: 0, ry: 0, op: 0 }); });
    // Set up while the title cards play.
    at(T.s03 + .2, async () => {
      await frame.evaluate(() => document.querySelector('.item-search input').focus());
      await page.keyboard.insertText('Laptop'); await page.clock.runFor(200);
      await frame.evaluate(() => [...document.querySelectorAll('[cmdk-item]')].find(e => e.textContent.trim().startsWith('Laptop')).click());
      await page.clock.runFor(200); await clickText('button.chip', 'Battery'); await page.clock.runFor(400);
      await frame.evaluate(() => document.activeElement?.blur?.());
    });
    const b = T.s05;
    at(b - .3, () => st('camTo', b - .3, b + .4, { op: 1, s: 2.1 }));
    at(b - .1, () => clickSel('.mobile-result'));
    at(b + .9, async () => { const r = await rect('.drawer-content .verdict'); await st('camTo', b + .4, b + 1.4, { s: 2.15, y: r.y + 230 }); });
    sceneCard({ t0: tl('s05') + lines.s05.d * .22, t1: T.s05_end - .1, cls: 'stamp', rise: 12, style: 'align-items:center', html: `<div class="stampbox" style="margin-top:75.2vh;padding:1.6vmin 3.4vmin"><div class="n">86.4%</div><div class="t">fixed or repairable</div></div>` });
    hideWin(T.s05_end - .3);
    // Routes, then Bristol repair events, in the phone layout.
    at(T.s08 + .4, async () => {
      await page.keyboard.press('Escape'); await page.clock.runFor(900);
      await frame.evaluate(() => { document.activeElement?.blur?.(); document.head.insertAdjacentHTML('beforeend', '<style>.mobile-result:focus,.mobile-result:focus-visible{outline:none;box-shadow:none}</style>'); const r = document.querySelector('.routes'); window.scrollTo({ top: r.getBoundingClientRect().top + scrollY - 12, behavior: 'instant' }); });
      await page.clock.runFor(300);
    });
    const e = T.n09;
    at(e - .05, async () => { await st('camSet', { op: 0, s: 2.0, x: AW / 2, y: AH / 2 }); await st('camTo', e, e + .6, { op: 1, s: 2.1 }); });
    at(e + .3, async () => { const r = await rect('.route.is-best'); if (r.y > 0 && r.y + r.h < AH - 60) await st('ring', { t0: e + .3, t1: tl('n09a') + lines.n09a.d * .4, x: r.x - 5, y: r.y - 5, w: r.w + 10, h: r.h + 10 }); });
    at(tl('n09a') + lines.n09a.d * .42, async () => { const o = await frame.evaluate(() => { const r = document.querySelector('.routes').getBoundingClientRect(); return { from: scrollY, to: Math.min(r.bottom + scrollY - innerHeight + 70, document.documentElement.scrollHeight - innerHeight) }; }); scroll = { t0: tl('n09a') + lines.n09a.d * .42, t1: te('n09a') - .3, from: o.from, to: o.to }; });
    hideWin(T.n09_end - .25, .25);
    const g = T.n10;
    at(T.n09_end, async () => {
      await frame.evaluate(() => { location.hash = '/events'; });
      await waitSel('.events-page .place-form input');
      await frame.evaluate(() => document.querySelector('.events-page .place-form input').focus());
      await page.keyboard.insertText('Bristol, UK');
      await frame.evaluate(() => document.querySelector('.events-page .place-form button[type=submit]').click());
      await pump(() => !!document.querySelector('.place-choices button') || (!!document.querySelector('.event-list li') && !document.querySelector('.place-form button[disabled]')), 'events');
      if (await frame.evaluate(() => !!document.querySelector('.place-choices button'))) { await frame.evaluate(() => document.querySelector('.place-choices button').click()); await waitSel('.event-list li'); }
      await frame.evaluate(() => { document.activeElement?.blur?.(); const m = document.querySelector('.events-page .map'); window.scrollTo({ top: m.getBoundingClientRect().top + scrollY - 10, behavior: 'instant' }); });
      await waitTiles(); await page.clock.runFor(400);
      await st('camSet', { op: 0, s: 2.0, x: AW / 2, y: AH / 2 }); await st('camTo', g, g + .6, { op: 1, s: 2.1 });
    });
    const calP = tl('n10') + lines.n10.d * .55;
    pointClick(calP - .45, .4, () => rect('.event-list li button.secondary'), () => clickSel('.event-list li button.secondary'));
    at(calP, async () => { await st('curHide'); const r = await rect('.event-list li button.secondary'); await st('ring', { t0: calP, t1: T.n10_end - .2, x: r.x - 5, y: r.y - 4, w: r.w + 10, h: r.h + 8 }); });
    sceneCard({ t0: g + .3, t1: T.n10_end - .1, cls: 'stamp', rise: 12, style: 'align-items:center', html: `<div class="stampbox" style="margin-top:9.5vh;padding:1.6vmin 3.4vmin"><div class="n" style="color:#f4f1e9">954</div><div class="t">upcoming repair events</div></div>` });
    hideWin(T.n10_end - .25, .25);
  }
  queue.sort((a, b) => a.t - b.t);

  // ---- Frame loop ----
  const stepAnimations = dt => { for (const a of document.getAnimations()) { const end = a.effect?.getComputedTiming().endTime ?? 0; if (a.playState === 'finished') continue; const now = (a.currentTime ?? 0) + dt; a.pause(); if (now >= end) a.finish(); else a.currentTime = now; } };
  const from = arg('from', 0), to = Math.min(arg('to', END), END);
  const ff = spawn(FF, ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', String(FPS), path.resolve(out)], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.ceil(END * FPS), dtMs = 1000 / FPS; let qi = 0, lastLog = Date.now();
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    while (qi < queue.length && queue[qi].t <= t) { await queue[qi].fn(); qi++; }
    if (scroll) { const k = Math.min(1, (t - scroll.t0) / (scroll.t1 - scroll.t0)), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await frame.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), scroll.from + (scroll.to - scroll.from) * e); if (k >= 1) scroll = null; }
    await page.evaluate(x => stage.render(x), t);
    await page.clock.runFor(dtMs);
    await Promise.all([page.evaluate(stepAnimations, dtMs), frame.evaluate(stepAnimations, dtMs)]);
    if (t < from || t > to) continue;
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 96, optimizeForSpeed: true });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (Date.now() - lastLog > 30000) { lastLog = Date.now(); console.log(`${t.toFixed(1)}/${END.toFixed(1)} s, ${((Date.now() - t0) / 1000).toFixed(0)} s elapsed`); }
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  await browser.close(); server.close();
  console.log('done', out, 'end', END.toFixed(2), JSON.stringify(T));
})().catch(e => { console.error(String(e.stack || e).slice(0, 1500)); process.exit(1); });
