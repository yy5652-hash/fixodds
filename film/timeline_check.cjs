// Pure Node: no browser or Playwright import.
const assert = require('node:assert/strict');
const { makePlan, cardBeats, firstLines } = require('./plan.cjs');
const beatData = require('./beats.json');
for (const mode of ['landscape', 'portrait']) {
  const { T, lines, caps, END, cards } = makePlan(mode);
  console.log(mode);
  for (const [key, value] of Object.entries(T)) console.log(`${key}=${value.toFixed(3)}`);
  console.log(`END=${END.toFixed(3)}`);
  const [min, max] = mode === 'landscape' ? [110, 130] : [50, 62];
  assert(END >= min && END <= max, `${mode} duration outside ${min}–${max}s`);
  assert.equal(T.a2_verdict, lines.a2b.t);
  assert.deepEqual(Object.keys(T).filter(k => /^a\d+$/.test(k)), mode === 'landscape'
    ? ['a1','a2','a3','a4','a5','a6','a7','a8','a9','a10'] : ['a1','a2','a3','a5','a6','a10']);
  const voice = Object.entries(lines);
  for (let i = 0; i < voice.length; i++) {
    const [id, l] = voice[i];
    assert(l.d > 0 && l.t >= 0 && l.t + l.d <= END, id);
    if (i) assert(voice[i - 1][1].t + voice[i - 1][1].d <= l.t, 'overlapping speech');
  }
  for (const c of caps) assert(c.t0 >= 0 && c.t1 > c.t0 && c.t1 <= END);
  for (const id of cards) {
    const tc = T[id + '_card'], earliest = T[id] + .15;
    const beats = cardBeats(mode, T, id);
    const first = beats.find(t => t >= earliest - 1e-9);
    assert(first !== undefined && Math.abs(tc - first) < 1e-8, id + ' missed beat');
    assert(tc <= earliest + 2.1);
    assert(Math.abs(lines[firstLines[id]].t - tc - 1.1) < 1e-8);
    assert(lines[firstLines[id]].t < T[id + '_end']);
    const splice = mode === 'landscape' && id === 'a7';
    console.log(`${id}_card beat=yes${splice ? ` (splice source ${beatData.splice.entry_src.toFixed(1)}s)` : ''}`);
  }
}
