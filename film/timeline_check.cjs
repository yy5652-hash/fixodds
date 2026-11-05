// Pure Node: no browser or Playwright import.
const assert = require('node:assert/strict');
const { makePlan, cardBeats } = require('./plan.cjs');
const beatData = require('./beats.json');
for (const mode of ['landscape', 'portrait']) {
  const { T, lines, END, cards } = makePlan(mode);
  console.log(mode);
  for (const [key, value] of Object.entries(T)) console.log(`${key}=${value.toFixed(3)}`);
  console.log(`END=${END.toFixed(3)}`);
  for (const id of cards) {
    const tc = T[id + '_card'], earliest = T[id] + .15;
    const beats = cardBeats(mode, T, id);
    const first = beats.find(t => t >= earliest - 1e-9 && t <= earliest + 1.2 + 1e-9);
    const splice = mode === 'landscape' && id === 'n12';
    assert(Math.abs(tc - (splice ? earliest : first ?? earliest)) < 1e-8);
    const firstLine = id === 'n09' ? 'n09a' : id;
    assert(Math.abs(lines[firstLine].t - tc - 1.1) < 1e-8);
    assert(lines[firstLine].t < T[id + '_end']);
    const onBeat = beats.some(b => Math.abs(b - tc) < 1e-8);
    console.log(`${id}_card beat=${onBeat ? 'yes' : 'no (fallback: no beat in 1.2s window)'}${splice ? ` (splice source ${beatData.splice.entry_src.toFixed(1)}s)` : ''}`);
  }
}
