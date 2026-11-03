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

const narration = Object.fromEntries(JSON.parse(fs.readFileSync(__dirname + '/narration_v2.json')).map(l => [l.id, l]));
function wavDur(id) {
  const b = fs.readFileSync(`${__dirname}/audio_v2/${id}.wav`);
  const data = b.indexOf('data'); return b.readUInt32LE(data + 4) / (b.readUInt32LE(24) * b.readUInt16LE(34) / 8 * b.readUInt16LE(22));
}
// Scene plan: narration lines, silence before and after. Short version reuses the same takes.
const scenes = PORTRAIT ? [
  ['s01', ['s01'], .25, .5], ['s03', ['s03a', 's03b'], .1, .5], ['s05', ['s05'], .2, .6],
  ['s06', ['s06b', 's06c'], .1, .5], ['s07', ['s07a'], .1, .5], ['s08', ['s08a'], .1, .6],
  ['s09', ['s09b'], .1, .4], ['s12', ['s12'], .3, 1.6],
] : [
  ['s01', ['s01'], .25, .6], ['s02', ['s02'], .1, .5], ['s03', ['s03a', 's03b'], .1, .6],
  ['s04', ['s04a', 's04b'], .9, .3], ['s05', ['s05'], .15, 1.0], ['s06', ['s06a', 's06b', 's06c'], .1, .7],
  ['s07', ['s07a', 's07b', 's07c'], .3, .6], ['s08', ['s08a', 's08b', 's08c'], .2, .8],
  ['s09', ['s09a', 's09b'], .3, .6], ['s10', ['s10'], .3, .6], ['s11', ['s11'], .3, .6], ['s12', ['s12'], .3, 2.4],
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
  await ctx.route(/openstreetmap\.org/, async route => {
    const key = crypto.createHash('sha1').update(route.request().url()).digest('hex'), p = `${cacheDir}/${key}`;
    if (fs.existsSync(p)) { const m = JSON.parse(fs.readFileSync(p + '.json')); return route.fulfill({ status: 200, contentType: m.type, headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(p) }); }
    const res = await route.fetch(); const body = await res.body();
    if (res.status() === 200) { fs.writeFileSync(p, body); fs.writeFileSync(p + '.json', JSON.stringify({ type: res.headers()['content-type'] })); }
    await route.fulfill({ response: res, body });
  });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-11-02T12:00:00Z') });
  await page.goto(`http://127.0.0.1:${port}/stage.html`);
  await page.evaluate(o => stage.init(o), { portrait: PORTRAIT, w: AW, h: AH, cy: PORTRAIT ? .44 : .5, src: `http://127.0.0.1:${port}/app/index.html`, caps });
  const frameEl = await page.waitForSelector('#app');
  const frame = await frameEl.contentFrame();
  await frame.waitForSelector('.check-form', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await frame.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.clock.pauseAt(new Date('2026-11-02T12:00:10Z'));
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
  sceneCard({ t0: T.s12 + .1, t1: 1e9, fade: .5, drift: 0, html: `<div id="brand">FixOdds<span class="acc">.</span></div><div class="mid" style="margin-top:1vmin">Give repair a fair chance.</div><div class="label acc" style="margin-top:4.5vmin">yy5652-hash.github.io/fixodds</div><div class="small" style="margin-top:6vmin">Data: Open Repair Alliance · The Restart Project · OpenStreetMap contributors<br>Music: Dvořák, Symphony No. 9, Musopen</div>` });

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
    // S09 barriers, then the Berlin map
    const e = T.s09;
    at(e - .1, async () => {
      const o = await frame.evaluate(() => { const a = [...document.querySelectorAll('.result-details button')]; a.find(x => x.textContent.includes('How these figures')).click(); const h = a.find(x => x.textContent.includes('What usually stops')); h.click(); const b = h.getBoundingClientRect(); window.scrollTo({ top: Math.min(b.top + scrollY - 90, document.documentElement.scrollHeight), behavior: 'instant' }); const c = h.getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y }; });
      await page.clock.runFor(350);
      await st('camSet', { op: 0, rx: 0, ry: 0, ...fill(o.x, o.y + 250, 1.4) });
      await st('camTo', e, e + .8, { op: 1, ...fill(o.x, o.y + 250, 1.55) });
    });
    const find0 = tl('s09b') - .75;
    pointClick(find0 - .6, .55, () => textRect('.result-details button', 'Find a repairer'), () => frame.evaluate(() => { [...document.querySelectorAll('.result-details button')].find(x => x.textContent.includes('Find a repairer')).click(); }));
    at(find0 + .05, async () => {
      await waitSel('.place-form input');
      await frame.evaluate(() => { document.querySelector('.place-form input').focus(); });
      await page.keyboard.insertText('Berlin, Germany');
      await frame.evaluate(() => document.querySelector('.place-form button[type=submit]').click());
      await waitSel('.place-choices button');
      await frame.evaluate(() => document.querySelector('.place-choices button').click());
      await waitSel('.repair-list');
    });
    at(find0 + .3, async () => { await page.clock.runFor(400); await frame.evaluate(() => document.querySelector('.finder .map').scrollIntoView({ block: 'center', behavior: 'instant' })); const r = await rect('.map'); await frame.evaluate(() => document.activeElement?.blur?.()); await st('curHide'); await st('camSet', { op: 0, ...fill(r.x + r.w / 2, r.y + r.h / 2, 1.34) }); await st('camTo', find0 + .3, find0 + .8, { op: 1 }); });
    at(find0 + 1.0, async () => { await waitTiles(); const r = await rect('.map'); await st('camTo', find0 + 1.0, T.s09_end, fill(r.x + r.w / 2, r.y + r.h / 2, 1.55)); });
    sceneCard({ t0: find0 + 1.3, t1: T.s09_end - .1, cls: 'stamp', rise: 12, html: `<div class="stampbox" style="margin:7vh 6vw 0 0"><div class="n" style="color:#f4f1e9">20,034</div><div class="t">mapped repair places</div></div>` });
    hideWin(T.s09_end - .25, .25);
    // S10 ticket, log, export
    const f = T.s10;
    at(f - .1, async () => { await frame.evaluate(() => { location.hash = '/ticket'; }); await waitSel('.ticket-sheet'); await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); const r = await rect('.ticket-sheet'); await st('camSet', { op: 0, rx: 2, ry: 3, ...fill(720, 405, 1.3) }); await st('camTo', f, f + 1.0, { op: 1, rx: 0, ry: 0, ...fill(720, 405, 1.42) }); });
    scrollTo(f + 1.0, lines.s10.d * .34, 260);
    const logAt = tl('s10') + lines.s10.d * .46;
    at(logAt, async () => { await frame.evaluate(() => { location.hash = '/log'; }); await waitSel('.log-form form'); await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); const r = await rect('.log-form'); await st('camTo', logAt, logAt + .6, fill(720, r.y + r.h / 2, 1.42)); await st('curTo', logAt, logAt, r.x + r.w / 2, r.y + r.h + 60); });
    pointClick(logAt + .35, .5, () => rect('.log-form form button[type=submit]'), () => clickSel('.log-form form button[type=submit]'));
    pointClick(logAt + 1.5, .7, () => textRect('button', 'Export ORDS CSV'), () => clickText('button', 'Export ORDS CSV'));
    at(logAt + 1.6, async () => { const r = await textRect('button', 'Export ORDS CSV'); await st('camTo', logAt + 1.6, logAt + 2.6, fill(720, r.y + 60, 1.5)); });
    hideWin(T.s10_end - .25, .25);
    // S11 method page
    const g = T.s11;
    at(g - .1, async () => { await st('curHide'); await frame.evaluate(() => { location.hash = '/method'; }); await waitSel('#calibration svg'); await frame.evaluate(() => document.querySelector('#calibration').scrollIntoView({ block: 'start', behavior: 'instant' })); await page.waitForTimeout(60); const r = await rect('#calibration svg'); await st('camSet', { op: 0, rx: 0, ry: 0, ...fill(r.x + r.w / 2, r.y + r.h / 2, 1.4) }); await st('camTo', g, g + 2.6, { op: 1, ...fill(r.x + r.w / 2, r.y + r.h / 2, 1.7) }); });
    const fr = tl('s11') + lines.s11.d * .42;
    at(fr, async () => { const h = await frame.evaluate(() => { const e = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('Why free-text')); return e.getBoundingClientRect().top + scrollY - 60; }); scroll = { t0: fr, t1: fr + 1.2, from: await frame.evaluate(() => scrollY), to: h }; await st('camTo', fr, fr + 1.2, fill(720, 300, 1.5)); });
    hideWin(T.s11_end - .35);
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
    const c = T.s07;
    at(c - .05, async () => { await frame.evaluate(() => { const b = document.querySelector('.drawer-content .impact-block'); b.scrollIntoView({ block: 'center', behavior: 'instant' }); }); await page.waitForTimeout(50); const r = await rect('.drawer-content .impact-block'); await st('camSet', { op: 0, s: 2.05, x: AW / 2, y: r.y + r.h / 2 }); await st('camTo', c, c + .9, { op: 1, s: 2.2 }); await st('ring', { t0: c + .4, t1: T.s07_end, x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 }); });
    hideWin(T.s07_end - .3);
    // Map: search runs while the previous card is on screen.
    at(T.s08 + .4, async () => {
      await frame.evaluate(() => { [...document.querySelectorAll('.drawer-content button')].find(x => x.textContent.includes('Find a repairer')).click(); });
      await page.clock.runFor(800);
      await waitSel('.place-form input');
      await frame.evaluate(() => document.querySelector('.place-form input').focus());
      await page.keyboard.insertText('Berlin, Germany');
      await frame.evaluate(() => document.querySelector('.place-form button[type=submit]').click());
      await waitSel('.place-choices button');
      await frame.evaluate(() => document.querySelector('.place-choices button').click());
      await waitSel('.repair-list');
      await page.clock.runFor(800);
      await frame.evaluate(() => { document.activeElement?.blur?.(); document.querySelector('.finder .map').scrollIntoView({ block: 'center', behavior: 'instant' }); });
      await waitTiles();
      await page.clock.runFor(800);
      await frame.evaluate(() => document.activeElement?.blur?.());
    });
    const e = T.s09;
    at(e - .05, async () => { await frame.evaluate(() => { document.activeElement?.blur?.(); document.head.insertAdjacentHTML('beforeend', '<style>.mobile-result:focus,.mobile-result:focus-visible{outline:none;box-shadow:none}</style>'); }); const r = await rect('.map'); await st('camSet', { op: 0, s: 2.0, x: AW / 2, y: r.y + r.h / 2 }); await st('camTo', e, e + .6, { op: 1, s: 2.1 }); });
    sceneCard({ t0: e + .3, t1: T.s09_end - .1, cls: 'stamp', rise: 12, style: 'align-items:center', html: `<div class="stampbox" style="margin-top:9.5vh;padding:1.6vmin 3.4vmin"><div class="n" style="color:#f4f1e9">20,034</div><div class="t">mapped repair places</div></div>` });
    hideWin(T.s09_end - .25, .25);
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
