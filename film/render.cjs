// Renders the FixOdds film frame by frame: the real built site runs in an iframe on a stage page,
// page time is stepped by hand, so slow camera moves stay smooth and text stays sharp at any zoom.
// node film/render.cjs <landscape|portrait> <out.mp4> [--fps N] [--scale N] [--from S --to S]
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(ROOT + '/node_modules/@playwright/test');
const FF = process.env.FF || path.resolve(ROOT, '../revoice-2026-10-24/bin/ffmpeg');
const mode = process.argv[2] || 'landscape', out = process.argv[3] || 'film/work/test.mp4';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : d; };
const FPS = arg('fps', 30), SCALE = arg('scale', 1), PORTRAIT = mode === 'portrait';
if (!Number.isFinite(SCALE) || SCALE <= 0) throw Error('--scale must be a positive number');
const [W, H] = PORTRAIT ? [1080, 1920] : [1920, 1080];
const [AW, AH] = PORTRAIT ? [480, 690] : [1440, 810];

const { makePlan } = require('./plan.cjs');
const { T, lines, caps, END } = makePlan(mode);
fs.writeFileSync(`${__dirname}/work/timeline_${mode}.json`, JSON.stringify({ scenes: T, lines, end: END }, null, 1));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/json' };
const footageDir = id => {
  const hires = path.join(__dirname, 'footage', 'graded_4k', id);
  return !PORTRAIT && SCALE > 1 && fs.existsSync(hires)
    ? hires : path.join(__dirname, 'footage', PORTRAIT ? 'graded_v' : 'graded', id);
};
const server = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]); let f;
  if (u === '/stage.html') f = __dirname + '/stage.html';
  else if (u.startsWith('/footage/')) {
    const candidate = path.resolve(__dirname, '.' + u);
    if (candidate.startsWith(path.resolve(__dirname, 'footage') + path.sep)) {
      f = candidate;
      const graded = path.relative(path.join(__dirname, 'footage', 'graded'), candidate).split(path.sep);
      if (graded.length === 2 && graded[0] !== '..') f = path.join(footageDir(graded[0]), graded[1]);
    }
  }
  else if (u.startsWith('/fonts/')) f = ROOT + '/node_modules/@fontsource-variable/inter/files/' + path.basename(u);
  else if (u.startsWith('/app/')) f = ROOT + '/dist/' + (u.slice(5) || 'index.html');
  if (!f || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, colorScheme: 'dark', serviceWorkers: 'block', locale: 'en-GB', acceptDownloads: true,
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
  const frameCounts = Object.fromEntries(require('./footage/clips.json').clips.map(c => {
    const dir = footageDir(c.id);
    const count = fs.readdirSync(dir).filter(f => /^\d{4,}\.jpg$/.test(f)).length;
    if (!count) throw Error('No graded footage: ' + c.id);
    return [c.id, count];
  }));
  await page.evaluate(o => stage.init(o), { portrait: PORTRAIT, frameCounts, w: AW, h: AH, cy: PORTRAIT ? .44 : .5, src: `http://127.0.0.1:${port}/app/index.html`, caps });
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

  // ---- v7: one five-year-old laptop, from broken to fixed ----
  const tl = l => lines[l].t, te = l => lines[l].t + lines[l].d;
  const subject = (r, s) => ({ ...fill(r.x + r.w / 2, r.y + r.h / 2, s),
    y: r.y + r.h / 2 + H * ((PORTRAIT ? .44 : .5) - .43) / s });
  const floatIn = async (id, target) => {
    const end = T[id + '_card'] !== undefined ? T[id + '_card'] + 1.1 : T[id] + .3;
    await st('camSet', { ...target, s: target.s * .9, rx: 6, ry: -8, op: 0 });
    await st('camTo', end - .1, end + .7, { ...target, op: 1, rx: 0, ry: 0 });
  };
  const highlight = async (r, t0, t1) => {
    await st('spot', { t0, t1, x: r.x + r.w / 2, y: r.y + r.h / 2, rx: r.w / 2 + 24, ry: r.h / 2 + 20 });
    await st('ring', { t0, t1, x: r.x - 6, y: r.y - 5, w: r.w + 12, h: r.h + 10 });
  };
  const hideWin = (t0, dur = .3) => at(t0, async () => { await st('curHide'); await st('camTo', t0, t0 + dur, { op: 0 }); });
  const reveal = async sel => {
    await frame.evaluate(s => { const e = document.querySelector(s); if (!e) throw Error('no ' + s);
      window.scrollTo({ top: Math.max(0, e.getBoundingClientRect().top + scrollY - (innerWidth < 900 ? 170 : 210)), behavior: 'instant' }); }, sel);
    await page.clock.runFor(100);
    return rect(sel);
  };
  const focus = (t, sel, until, scale = PORTRAIT ? 1.95 : 1.85) => at(t, async () => {
    const r = await reveal(sel); await st('camTo', t, t + .3, { ...subject(r, scale), op: 1, rx: 0, ry: 0 }); await highlight(r, t + .15, until);
  });
  const BRISTOL = { lat: 51.454, lon: -2.597, name: 'Bristol, City of Bristol, England, United Kingdom' };
  const seedArea = () => frame.evaluate(a => { localStorage.setItem('fixodds-area-v1', JSON.stringify(a)); window.dispatchEvent(new Event('fixodds-area')); }, BRISTOL);
  at(0, async () => {
    await seedArea(); await st('camSet', { x: AW / 2, y: AH / 2, s: PORTRAIT ? 2 : 1.1, rx: 0, ry: 0, op: 0 });
    await page.evaluate(() => { document.getElementById('caption').style.bottom = '3vh'; });
  });

  // Cards stay above the footage and the real UI; only the tracker carries Demo.
  const hookCut = tl('a1') + lines.a1.d * .52;
  await sceneCard({ t0: .2, t1: hookCut, fade: .2, html: '<div class="huge">Broken.</div>' });
  await sceneCard({ t0: hookCut, t1: T.a1_end, fade: .2, html: '<div class="huge">Bin it?</div>' });
  await sceneCard({ t0: T.a3_card, t1: T.a3_card + 1.1, fadeIn: .12, fadeOut: .15, rise: 0, drift: 0,
    html: '<div class="big">Next step:<br>repair cafe</div>' });
  await sceneCard({ t0: tl('a2c'), t1: T.a2_end - .05, cls: 'stamp verdict-stamp', rise: 12,
    html: '<div class="stampbox"><div class="n">Repair first</div><div class="t">49% fixed · 40% more work or parts</div></div>' });
  await sceneCard({ t0: tl('a5b'), t1: T.a5_end, cls: 'demo-card', rise: 0, drift: 0, fade: .12,
    html: '<span class="demo-label">Demo</span>' });
  await sceneCard({ t0: T.a5_end - (PORTRAIT ? 1.35 : 2), t1: T.a5_end, cls: 'fixed-card', fade: .15,
    html: '<div class="stampbox"><div class="mid fix">Fixed — still in use</div></div>' });
  await sceneCard({ t0: T.a6_card, t1: tl('a6b'), html: '<div class="big">1.8 kg<br>kept in use</div><div class="mid fix" style="margin-top:4vmin">≈133 kg CO₂e if fixed</div>' });
  await sceneCard({ t0: tl('a6b'), t1: T.a6_end, html: '<div class="mid" style="max-width:17em">Before the repair:<br><span class="fix">≈65 kg CO₂e</span>, weighted by the 49% chance of a fix</div><div class="small">Category average · half of fixes assumed to replace a purchase</div>' });
  if (!PORTRAIT) {
    await sceneCard({ t0: T.a7_card, t1: tl('a7b'), html: `<div class="big">${count(0, 11130, 1.7)}</div><div class="label">later repairs the model never saw</div>` });
    await sceneCard({ t0: tl('a7b'), t1: T.a7_end, html: '<div class="big fix">70% fixed<br>+ 18% more work</div><div class="small">‘Repair first’ band · 41,047 test repairs in all</div>' });
    await sceneCard({ t0: T.a8_card, t1: T.a8_end, html: '<div class="label" style="max-width:24em;margin-bottom:4vmin">Estimated benefit of past repairs in the dataset</div><div class="big fix">≈5,400 t CO₂e</div>' });
    await sceneCard({ t0: T.a9, t1: T.a9_end, cls: 'language-card', html: '<div class="small">Interface in 5 languages</div>' });
    await sceneCard({ t0: T.a4_end - 1.35, t1: T.a4_end, cls: 'fixed-card', html: '<div class="stampbox"><div class="mid fix">Message sent</div></div>' });
  }
  // qrcode-generator 2.0.4: createSvgTag options verified against its shipped API
  // and upstream js/README.md; four-module quiet zone, inverted white on dark.
  const qr = require(ROOT + '/node_modules/qrcode-generator')(0, 'M');
  qr.addData('https://yy5652-hash.github.io/fixodds/'); qr.make();
  const qrSvg = qr.createSvgTag({ cellSize: 1, margin: 4, scalable: true })
    .replace('fill="white"', 'fill="#12110e"').replace('fill="black"', 'fill="#ffffff"');
  await sceneCard({ t0: T.a10, t1: 1e9, cls: 'end-card', fade: .3, rise: 0, drift: 0,
    html: `<div id="brand">FixOdds<span class="acc">.</span></div><div class="mid end-tagline">Give repair a fair chance.</div>
      <div class="end-url acc">yy5652-hash<span class="url-host">.github.io/fixodds/</span></div>
      <div class="end-qr">${qrSvg}</div><div class="end-credits">
      <div>Data: Open Repair Alliance · The Restart Project · Restarters.net · OpenStreetMap contributors · iFixit</div>
      <div class="footage-credit">Footage: Pexels contributors · Repair Café Nijmegen-Oost (N1) and Repair Café Almelo (AAVISIE), CC BY 3.0, Wikimedia Commons</div>
      <div>Music: Dvořák, Symphony No. 9, Musopen</div></div>` });

  const footage = [];
  const reel = (id, t0, t1, dim, extra = {}) => footage.push({ id, t0, t1, dim, ...extra });
  reel('hook', T.a1, hookCut, .45); reel('ewaste', hookCut, T.a1_end, .45);
  reel('rc_hall', T.a3, T.a3_card + 1.1, .55, { fadeOut: .12 });
  const repairCut = tl('a5a') + lines.a5a.d * .55;
  reel('rc_probe', T.a5, repairCut, 0); reel('rc_lamp', repairCut, tl('a5b'), 0, { fadeOut: .12 });
  reel('kettle', T.a6, T.a6_end, .7);
  if (!PORTRAIT) {
    reel('rc_bench', T.a7, T.a7_end, .6);
    const crowdCut = T.a8 + (T.a8_end - T.a8) * .5;
    reel('rc_crowd', T.a8, crowdCut, .55); reel('rc_hall2', crowdCut, T.a8_end, .55);
  }
  reel('kettle', T.a10, END, .65, { fadeOut: 0 });
  footage.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i < footage.length - 1; i++) {
    const a = footage[i], b = footage[i + 1];
    if (Math.abs(a.t1 - b.t0) < 1e-6) { a.t1 += .15; a.fadeOut = .15; b.fadeIn = .15; }
  }
  for (const clip of footage) await st('clip', clip);

  // A2: visible form work, then the exact same live result. Mobile uses its drawer.
  const a = T.a2, pace = PORTRAIT ? 1 : 1.55, q = n => a + n * pace;
  at(a, async () => { const r = await reveal('.item-search input'); await floatIn('a2', subject(r, 1.85)); });
  focus(q(.25), '.item-search input', q(.95));
  pointClick(q(.3), .12, () => rect('.item-search input'), () => clickSel('.item-search input'));
  typeText(q(.44), 'Laptop', .035 * pace);
  // Match the display label rather than assuming cmdk's generated data-value.
  const laptopRect = () => frame.evaluate(() => {
    const el = [...document.querySelectorAll('[cmdk-item]')].find(e => e.textContent.trim().startsWith('Laptop'));
    if (!el) throw Error('No Laptop option'); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  pointClick(q(.7), .14, laptopRect, () => clickText('[cmdk-item]', 'Laptop'));
  pointClick(q(.99), .14, () => textRect('.check-form .accordion button', 'Sharpen the odds'), async () => {
    await clickText('.check-form .accordion button', 'Sharpen the odds'); await page.clock.runFor(350);
  });
  const age = '.check-form input[type="number"]';
  focus(q(1.19), age, q(1.75));
  pointClick(q(1.28), .12, () => rect(age), () => clickSel(age));
  typeText(q(1.43), '5', .04);
  at(q(1.71), async () => {
    await clickText('.check-form .accordion button', 'Sharpen the odds'); await page.clock.runFor(250);
  });
  focus(q(1.78), '.check-form .symptoms', q(2.28));
  pointClick(q(1.9), .14, () => textRect('button.chip', 'Battery or charging'), () => clickText('button.chip', 'Battery or charging'));
  focus(q(2.3), '.check-form textarea', q(4.1));
  pointClick(q(2.38), .12, () => rect('.check-form textarea'), () => clickSel('.check-form textarea'));
  const typedDescription = typeText(q(2.56), 'The battery will not charge', .045 * pace);
  if (typedDescription >= tl('a2b') - .4) throw Error('Form typing overruns the verdict');
  at(tl('a2b') - .35, async () => {
    await st('curHide'); await frame.evaluate(() => document.activeElement?.blur?.());
    if (PORTRAIT) { await clickSel('.mobile-result'); await page.clock.runFor(450); }
    else await reveal('.result-card');
    const r = await rect(PORTRAIT ? '.drawer-content .verdict' : '.result-card .verdict');
    await st('camTo', tl('a2b') - .35, tl('a2b') + .15, subject({ ...r, h: r.h + 160 }, PORTRAIT ? 2.1 : 1.85));
    await highlight(r, tl('a2b'), tl('a2c'));
  });

  // A3: always choose the cafe route, even if a guide makes DIY the suggestion.
  const cafe = '.route-grid .route:nth-child(2)';
  at(T.a3, async () => {
    await st('curHide');
    if (PORTRAIT) { await page.keyboard.press('Escape'); await page.clock.runFor(500); }
    await waitSel(cafe); const r = await reveal(cafe); await floatIn('a3', subject(r, PORTRAIT ? 2.05 : 1.8));
  });
  at(tl('a3a'), async () => highlight(await rect(cafe), tl('a3a'), tl('a3b')));
  focus(tl('a3b') - .35, cafe + ' button.secondary', tl('a3b') + .65);
  pointClick(tl('a3b') - .2, .3, () => textRect(cafe + ' button', 'Make this my next step'), async () => {
    await clickText(cafe + ' button', 'Make this my next step');
    await pump(s => document.querySelector(s)?.textContent.includes('Next step added'), cafe);
    const r = await rect(cafe + ' [role="status"]'); await highlight(r, tl('a3b') + .2, te('a3b'));
  });
  at(te('a3b') + .05, async () => {
    if (await frame.evaluate(() => !!document.querySelector('.next-step'))) {
      const r = await reveal('.next-step'); await st('camTo', te('a3b') + .05, te('a3b') + .4, subject(r, PORTRAIT ? 2 : 1.85));
    }
    await st('curHide');
  });

  if (!PORTRAIT) {
    // A4: use the existing finder, preserving the saved cafe job. No message leaves.
    const send = T.a4;
    at(send, async () => {
      await clickSel('.routes button.route-link'); await waitSel('.finder .repair-list .ask'); await page.clock.runFor(500);
      await frame.evaluate(() => {
        const all = [...document.querySelectorAll('.finder .repair-list > li')].filter(l => l.querySelector('.ask'));
        const international = all.filter(l => [...l.querySelectorAll('a[href^="tel:"]')].some(a => /^tel:(\+|00)/.test(a.getAttribute('href'))));
        const li = international.find(l => /Repair cafe/i.test(l.textContent)) || international[0];
        if (!li) throw Error('No mapped WhatsApp contact near Bristol'); li.setAttribute('data-film', '1');
      });
      const r = await reveal('li[data-film] .ask'); await st('camTo', send, send + .4, subject(r, 1.85));
    });
    pointClick(send + .45, .3, () => rect('li[data-film] .ask'), async () => {
      await clickSel('li[data-film] .ask'); await waitSel('li[data-film] .enquiry textarea');
      // Local render URLs become the public ticket URL, through React's input event.
      await frame.evaluate(() => {
        const ta = document.querySelector('li[data-film] .enquiry textarea');
        const v = ta.value.replace(/http:\/\/127\.0\.0\.1:\d+\/app\/index\.html/, 'https://yy5652-hash.github.io/fixodds/');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, v);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.clock.runFor(100);
    });
    focus(send + .9, 'li[data-film] .enquiry textarea', send + 3.3, 1.7);
    const whatsapp = 'li[data-film] .enquiry a[href^="https://wa.me"]';
    focus(send + 3.4, whatsapp, send + 4.6);
    pointClick(send + 3.8, .35, () => rect(whatsapp), async () => {
      // As in e2e: cancel navigation only, allowing the delegated React handler.
      await frame.evaluate(s => document.querySelector(s).addEventListener('click', e => e.preventDefault()), whatsapp);
      await clickSel(whatsapp); await waitSel('li[data-film] .enquiry .notice button.primary');
    });
    focus(send + 4.45, 'li[data-film] .enquiry .notice', send + 5.65);
    pointClick(send + 5.1, .35, () => textRect('li[data-film] .enquiry button', 'Yes, I sent it'), () => clickText('li[data-film] .enquiry button', 'Yes, I sent it'));
    at(send + 5.55, () => st('curHide'));
  }

  // A5: footage hides only the navigation. Every repair-state change is a UI action.
  at(T.a5, async () => {
    await st('curHide'); await frame.evaluate(() => { location.hash = '/log'; }); await waitSel('.job .stepper');
    if (PORTRAIT) {
      // The short cut omits the enquiry scene; advance via the same confirmation UI.
      await clickText('.job button', 'Move to:'); await waitSel('.job .notice button.primary');
      await clickText('.job .notice button', 'Yes, I sent it'); await page.clock.runFor(100);
    }
    const r = await reveal('.job .stepper'); await st('camSet', { ...subject(r, PORTRAIT ? 2 : 1.85), op: 1, rx: 0, ry: 0 });
  });
  const job = tl('a5b'), stepPace = 1;
  const jt = n => job + n * stepPace;
  const moveBtn = () => textRect('.job button', 'Move to:');
  focus(job, '.job > .actions button', jt(.45));
  pointClick(jt(.2), .2, moveBtn, () => clickText('.job button', 'Move to:'));
  focus(jt(.45), '.job .stepper', jt(.85));
  focus(jt(.8), '.job > .actions button', jt(1.25));
  pointClick(jt(1), .2, moveBtn, () => clickText('.job button', 'Move to:'));
  focus(jt(1.25), '.job .stepper', jt(1.7));
  focus(jt(1.7), '.job .actions button.primary', jt(2.15));
  pointClick(jt(1.8), .2, () => textRect('.job button', 'Record the outcome'), async () => { await clickText('.job button', 'Record the outcome'); await waitSel('.job .outcome-form'); });
  focus(jt(2.1), '.job .outcome-form select', jt(2.75));
  pointClick(jt(2.25), .18, () => rect('.job .outcome-form select'), () => frame.selectOption('.job .outcome-form select', 'Fixed'));
  focus(jt(2.8), '.job .outcome-form button[type="submit"]', jt(3.4));
  pointClick(jt(2.95), .2, () => rect('.job .outcome-form button[type="submit"]'), async () => {
    await clickSel('.job .outcome-form button[type="submit"]'); await waitSel('.log-list li');
    const r = await reveal('.log-totals'); await st('camTo', jt(3.15), jt(3.5), subject(r, PORTRAIT ? 2 : 1.7));
    await highlight(r, jt(3.5), T.a5_end - .15); await st('curHide');
  });

  if (!PORTRAIT) {
    // A9: identical verdict/stack anchor for a one-second Chinese/German match cut.
    const lang = (t, code) => at(t, async () => {
      await st('curHide'); await frame.selectOption('select[aria-label="Language"]', code);
      await frame.evaluate(() => { location.hash = '/'; }); await waitSel('.result-card'); await page.clock.runFor(200);
      await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const r = await rect('.result-card .verdict');
      await st('camSet', { op: 1, rx: 0, ry: 0, s: 1.8, x: r.x + r.w / 2, y: r.y + H * (.5 - .28) / 1.8 });
    });
    lang(T.a9 + .15, 'zh'); lang(T.a9 + 1.15, 'de');
  }
  hideWin(T.a6, .2); hideWin(T.a10, .2);
  queue.sort((a, b) => a.t - b.t);

  // ---- Frame loop ----
  const stepAnimations = dt => { for (const a of document.getAnimations()) { const end = a.effect?.getComputedTiming().endTime ?? 0; if (a.playState === 'finished') continue; const now = (a.currentTime ?? 0) + dt; a.pause(); if (now >= end) a.finish(); else a.currentTime = now; } };
  const from = arg('from', 0), to = Math.min(arg('to', END), END);
  const encoder = SCALE > 1 ? ['-crf', '12', '-preset', 'slow', '-tune', 'film', '-pix_fmt', 'yuv420p']
    : ['-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p'];
  const ff = spawn(FF, ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', ...encoder, '-r', String(FPS), path.resolve(out)], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.ceil(END * FPS), dtMs = 1000 / FPS; let qi = 0, lastLog = Date.now();
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    while (qi < queue.length && queue[qi].t <= t) { const event = queue[qi++]; await event.fn(); queue.splice(qi, queue.length - qi, ...queue.slice(qi).sort((a, b) => a.t - b.t)); }
    if (scroll) { const k = Math.min(1, (t - scroll.t0) / (scroll.t1 - scroll.t0)), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await frame.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), scroll.from + (scroll.to - scroll.from) * e); if (k >= 1) scroll = null; }
    // stage.render resolves only once both visible footage images have decoded.
    await page.evaluate(x => stage.render(x), t);
    await page.clock.runFor(dtMs);
    await Promise.all([page.evaluate(stepAnimations, dtMs), frame.evaluate(stepAnimations, dtMs)]);
    if (t < from || t > to) continue;
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: SCALE > 1 ? 98 : 96, optimizeForSpeed: true, ...(SCALE > 1 ? { clip: { x: 0, y: 0, width: W, height: H, scale: SCALE } } : {}) });  // clip.scale renders the page at device pixels
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (Date.now() - lastLog > 30000) { lastLog = Date.now(); console.log(`${t.toFixed(1)}/${END.toFixed(1)} s, ${((Date.now() - t0) / 1000).toFixed(0)} s elapsed`); }
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  await browser.close(); server.close();
  console.log('done', out, 'end', END.toFixed(2), JSON.stringify(T));
})().catch(e => { console.error(String(e.stack || e).slice(0, 1500)); process.exit(1); });
