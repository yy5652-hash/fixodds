// Browser-free v7 planner shared by the renderer and the dry check.
const fs = require('fs');
const beatData = require('./beats.json');
const firstLines = { a3: 'a3a', a6: 'a6a', a7: 'a7a', a8: 'a8' };
function cardBeats(mode, T, id) {
  if (id === 'a3') return beatData.first_entry.offsets.map(o => T.a2_verdict + o);
  if (mode === 'landscape' && id === 'a7') return [T.a7_card]; // source re-entry is spliced here
  return mode === 'landscape' && id === 'a8'
    ? beatData.splice.offsets_after_entry.map(o => T.a7_card + o)
    : beatData.offsets.map(o => T.a5 + o);
}
function makePlan(mode) {
  if (!['landscape', 'portrait'].includes(mode)) throw Error('Unknown film mode: ' + mode);
  const PORTRAIT = mode === 'portrait';
  const narration = Object.fromEntries(JSON.parse(fs.readFileSync(__dirname + '/narration_v7.json')).map(l => [l.id, l]));
  function wavDur(id) {
    const b = fs.readFileSync(`${__dirname}/audio_v2/${id}.wav`);
    const data = b.indexOf('data');
    return b.readUInt32LE(data + 4) / (b.readUInt32LE(24) * b.readUInt16LE(34) / 8 * b.readUInt16LE(22));
  }
  const all = [
    ['a1', ['a1']], ['a2', ['a2a', 'a2b', 'a2c']], ['a3', ['a3a', 'a3b']],
    ['a4', ['a4']], ['a5', ['a5a', 'a5b']], ['a6', ['a6a', 'a6b']],
    ['a7', ['a7a', 'a7b']], ['a8', ['a8']], ['a9', ['a9']], ['a10', ['a10']],
  ];
  const scenes = PORTRAIT ? all.filter(([id]) => ['a1', 'a2', 'a3', 'a5', 'a6', 'a10'].includes(id)) : all;
  // Leads/tails are .3s. Interior silent beats give the actual actions time to read:
  // finish the form before the verdict, then finish/save the tracker outcome.
  const gaps = { a2b: PORTRAIT ? 2.8 : 6.2, a5b: PORTRAIT ? .28 : 1.5 };
  const holds = PORTRAIT ? { a3: .7, a5: 1.6 } : { a1: .1, a3: 1.4, a4: 2, a5: 6, a6: .8, a7: .9, a8: .9, a10: 4 };
  const T = {}, lines = {}, caps = [], cards = [];
  let cursor = 0;
  for (const [id, ls] of scenes) {
    T[id] = cursor;
    if (firstLines[id]) {
      const earliest = cursor + .15;
      // A7 is a deliberate music splice; all other titles use a measured onset.
      const beats = id === 'a7' ? [earliest] : cardBeats(mode, T, id);
      const tc = beats.find(t => t >= earliest - 1e-9);
      if (tc === undefined || tc > earliest + 2.1) throw Error('No nearby title beat for ' + id);
      T[id + '_card'] = tc; cards.push(id); cursor = tc + 1.1;
    } else cursor += .3;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (i) cursor += gaps[l] ?? .28;
      const d = wavDur(l); lines[l] = { t: cursor, d };
      if (l === 'a2b') T.a2_verdict = cursor;
      const text = narration[l].cap, max = PORTRAIT ? 56 : 62, chunks = []; let row = '';
      for (const w of text.split(' ')) {
        if ((row + ' ' + w).trim().length > max) {
          const m = [...row.matchAll(/[,:.] /g)].pop();
          if (m && m.index > max * .35) { chunks.push(row.slice(0, m.index + 1)); row = row.slice(m.index + 2) + ' ' + w; }
          else { chunks.push(row); row = w; }
        } else row = (row + ' ' + w).trim();
      }
      chunks.push(row);
      const total = chunks.reduce((a, c) => a + c.length, 0); let c0 = cursor + .05, span = d - .1;
      for (const c of chunks) { const cd = span * c.length / total; caps.push({ t0: c0, t1: c0 + cd - .02, text: c }); c0 += cd; }
      cursor += d;
    }
    cursor += (holds[id] || 0) + .3; T[id + '_end'] = cursor;
  }
  return { T, lines, caps, END: cursor, cards };
}
module.exports = { makePlan, cardBeats, firstLines };
