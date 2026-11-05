// Browser-free scene planner shared by rendering and the dry check.
const fs = require('fs');
const beatData = require('./beats.json');
function makePlan(mode) {
  const PORTRAIT = mode === 'portrait';
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
  const T = {}, lines = {}, caps = [], cards = [];
  const beatAt = earliest => {
    const beats = !PORTRAIT && T.n12_card !== undefined
      ? beatData.splice.offsets_after_entry.map(o => T.n12_card + o)
      : beatData.offsets.map(o => T.s08 + o);
    return beats.find(t => t >= earliest - 1e-9 && t <= earliest + 1.2 + 1e-9) ?? earliest;
  };
  let cursor = 0;
  for (const [id, ls, lead, tail] of scenes) {
    T[id] = cursor;
    if (id.startsWith('n')) {
      const earliest = cursor + .15;
      const tc = !PORTRAIT && id === 'n12' ? earliest : beatAt(earliest);
      T[id + '_card'] = tc; cards.push(id); cursor = tc + 1.1;
    } else cursor += lead;
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

  return { T, lines, caps, END, cards };
}
function cardBeats(mode, T, id) {
  if (mode === 'landscape' && id === 'n12') return [T.n12_card]; // splice re-entry
  return mode === 'landscape' && id === 'n13'
    ? beatData.splice.offsets_after_entry.map(o => T.n12_card + o)
    : beatData.offsets.map(o => T.s08 + o);
}
module.exports = { makePlan, cardBeats };
