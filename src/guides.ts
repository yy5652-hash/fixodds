// Live iFixit guide search for the chosen item and symptoms. Guides are linked and attributed, never copied (CC BY-NC-SA).
import { useEffect, useState } from 'react';
import { inputSymptoms, normalize, safety, symptomText, type Input } from './core';
export type Guide = { id: number; title: string; url: string; difficulty: string; minutes: number | null; image: string; author: string; type: string; matched?: boolean };
// Broad categories need a device type before a guide can count as an item match.
export const broadCategories = new Set(['Aircon/dehumidifier', 'Flat screen', 'Food processor', 'Printer/scanner', 'Watch/clock', 'Small kitchen item', 'Small home electrical', 'Misc', 'Decorative or safety lights', 'Hair & beauty item', 'Toy', 'Large home electrical', 'Battery/charger/adapter', 'Handheld entertainment device', 'Hi-Fi separates', 'Musical instrument', 'PC accessory', 'Power tool', 'TV and gaming-related accessories']);
// Search words and item names that must appear in the guide title.
export const itemTerms: Record<string, [string, string[]]> = {
  'Aircon/dehumidifier': ['air conditioning dehumidifier', ['dehumidifier', 'air conditioner', 'aircon']],
  'Battery/charger/adapter': ['battery charger adapter', ['charger', 'adapter', 'adaptor', 'battery pack', 'power supply', 'power bank']],
  'Coffee maker': ['coffee maker', ['coffee', 'espresso', 'nespresso', 'keurig', 'senseo', 'dolce gusto']],
  'DSLR/video camera': ['camera', ['camera', 'dslr', 'camcorder', 'eos', 'nikon', 'handycam']],
  'Decorative or safety lights': ['decorative or safety lights', ['light', 'lamp', 'led']],
  'Desktop computer': ['desktop', ['desktop', 'imac', 'computer', 'optiplex', ' pc']],
  'Digital compact camera': ['camera', ['camera', 'lumix', 'powershot', 'coolpix', 'cyber-shot']],
  'Fan': ['fan', ['fan']],
  'Flat screen': ['flat screen', ['tv', 'television', 'monitor', 'display']],
  'Food processor': ['food processor', ['blender', 'food processor', 'mixer', 'kitchenaid', 'thermomix']],
  'Games console': ['console', ['playstation', 'xbox', 'nintendo', 'switch', 'console', 'ps4', 'ps5', 'wii']],
  'Hair & beauty item': ['hair and beauty appliance', ['shaver', 'trimmer', 'straightener', 'razor', 'epilator', 'clipper']],
  'Hair dryer': ['hair dryer', ['hair dryer', 'hairdryer', 'blow dryer']],
  'Handheld entertainment device': ['handheld entertainment device', ['ipod', 'mp3', 'player', 'game boy', 'nintendo ds', '3ds']],
  'Headphones': ['headphones', ['headphone', 'earbud', 'airpods', 'headset', 'earphone']],
  'Hi-Fi integrated': ['stereo', ['stereo', 'hi-fi', 'hifi', 'receiver', 'boombox', 'micro system']],
  'Hi-Fi separates': ['hi-fi component', ['amplifier', 'receiver', 'turntable', 'cd player', 'cassette', 'speaker', 'tuner']],
  'Iron': ['iron', ['iron', 'steam generator']],
  'Kettle': ['kettle', ['kettle']],
  'Lamp': ['lamp', ['lamp', 'light']],
  'Laptop': ['laptop', ['laptop', 'macbook', 'thinkpad', 'notebook', 'chromebook', 'inspiron', 'pavilion', 'surface', 'ideapad', 'latitude']],
  'Large home electrical': ['large household appliance', ['washing machine', 'washer', 'dryer', 'dishwasher', 'fridge', 'refrigerator', 'oven']],
  'Mobile': ['phone', ['phone', 'iphone', 'galaxy', 'pixel', 'smartphone', 'moto']],
  'Musical instrument': ['musical instrument', ['keyboard', 'guitar', 'amplifier', 'piano', 'synth', 'pedal']],
  'PC accessory': ['computer accessory', ['mouse', 'keyboard', 'webcam', 'router', 'hard drive']],
  'Paper shredder': ['shredder', ['shredder']],
  'Portable radio': ['portable radio', ['radio']],
  'Power tool': ['power tool', ['drill', 'saw', 'sander', 'grinder', 'screwdriver', 'dewalt', 'makita', 'ryobi']],
  'Printer/scanner': ['printer scanner', ['printer', 'scanner']],
  'Projector': ['projector', ['projector']],
  'Sewing machine': ['sewing machine', ['sewing machine']],
  'Misc': ['electrical item', []],
  'Small home electrical': ['small household appliance', []],
  'Small kitchen item': ['small kitchen appliance', ['microwave', 'rice cooker', 'slow cooker', 'air fryer', 'juicer', 'waffle', 'sandwich']],
  'TV and gaming-related accessories': ['tv gaming accessory', ['controller', 'remote', 'joy-con', 'gamepad', 'dualshock', 'dualsense']],
  'Tablet': ['tablet', ['ipad', 'tablet', 'galaxy tab', 'kindle', 'fire hd']],
  'Toaster': ['toaster', ['toaster']],
  'Toy': ['toy', ['toy', 'robot', 'doll', 'rc car', 'furby', 'tamagotchi']],
  'Vacuum': ['vacuum', ['vacuum', 'dyson', 'hoover', 'shark', 'roomba']],
  'Watch/clock': ['watch clock', ['watch', 'clock']],
};
// Same word, different device: projector lamps, soldering irons, car radios.
const exclude: Record<string, string[]> = { 'Lamp': ['projector', 'powerlite', 'powershot', 'assist lamp'], 'Decorative or safety lights': ['projector', 'headlight', 'tail light'], 'Iron': ['soldering', 'ironman', 'golf'], 'Portable radio': ['car ', 'audi', 'toyota', 'honda', 'ford', 'tacoma', 'head unit', 'two-way'], 'Fan': ['laptop', 'macbook', 'console', 'playstation', 'xbox', 'gpu', 'cpu'], 'Watch/clock': ['clock battery replacement for car'] };
const symptomTerms: Record<string, string> = { battery: 'battery', screen: 'screen', no_power: 'power', cable_plug: 'cable', button: 'button', noise: 'noise', no_heat: 'heating element', leak: 'leak', stuck: 'jammed', no_motion: 'motor', software: 'boot', media: 'disc', no_sound: 'speaker', physical_break: 'case', too_hot: 'fan', liquid: 'water damage' };
export const difficultyRank = ['Very easy', 'Easy', 'Moderate', 'Difficult', 'Very difficult'];
export function queries(input: Input): string[] {
  const clean = (s: string) => normalize(s).replace(/[^\p{L}\p{N} -]/gu, '').trim().slice(0, 80);
  const term = clean(input.deviceType || '') || itemTerms[input.category]?.[0];
  if (!term) return [];
  const symptom = inputSymptoms(input).map(id => symptomTerms[id]).find(Boolean);
  const brand = clean(input.brand).slice(0, 30), model = clean(input.modelNumber || '');
  const item = [term, model].filter(Boolean).join(' ');
  return [...new Set([brand && symptom && `${brand} ${item} ${symptom}`, symptom && `${item} ${symptom}`, brand && `${brand} ${item}`, item].filter((q): q is string => !!q))];
}
export function matches(category: string, r: { title?: string; category?: string }, deviceType = '') {
  const words = deviceType.trim() ? [deviceType] : broadCategories.has(category) ? [] : itemTerms[category]?.[1] || [];
  const text = symptomText(r.title || '');
  return words.some(w => { const name = symptomText(w).trim(); return !!name && (text.includes(` ${name} `) || text.includes(` ${name}s `)); }) && !(exclude[category] || []).some(w => text.includes(symptomText(w)));
}
export const guideHazards = (guides: Guide[]) => [...new Set(guides.flatMap(g => safety({ category: '', age: 'unknown', brand: '', problem: g.title })))];
type Raw = { guideid?: number; title?: string; url?: string; difficulty?: string; time_required_max?: number; image?: { thumbnail?: string } | null; username?: string; category?: string; type?: string; dataType?: string };
export function toGuide(r: Raw): Guide | null {
  if (r.dataType !== 'guide' || typeof r.guideid !== 'number' || typeof r.title !== 'string' || typeof r.url !== 'string' || !r.url.startsWith('https://www.ifixit.com/')) return null;
  const minutes = typeof r.time_required_max === 'number' && r.time_required_max > 0 && r.time_required_max < 86400 ? Math.round(r.time_required_max / 60) : null;
  const image = typeof r.image?.thumbnail === 'string' && r.image.thumbnail.startsWith('https://') ? r.image.thumbnail : '';
  return { id: r.guideid, title: r.title, url: r.url, difficulty: r.difficulty || '', minutes, image, author: r.username || '', type: r.type || '' };
}
const cache = new Map<string, Promise<Guide[]>>();
async function search(q: string): Promise<Raw[]> {
  const response = await fetch(`https://www.ifixit.com/api/2.0/search/${encodeURIComponent(q)}?filter=guide&limit=12`, { signal: AbortSignal.timeout(12000), referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!response.ok) throw Error(`iFixit ${response.status}`);
  const body = await response.json();
  return Array.isArray(body?.results) ? body.results : [];
}
export function findGuides(input: Input, limit = 3): Promise<Guide[]> {
  const list = queries(input), key = [input.category, input.deviceType || '', limit, ...list].join('|');
  if (!list.length) return Promise.resolve([]);
  let found = cache.get(key);
  if (!found) {
    found = (async () => {
      const out = new Map<number, Guide>();
      let failures = 0;
      for (const q of list) {
        try { for (const r of await search(q)) { const g = toGuide(r); if (g && !out.has(g.id)) out.set(g.id, { ...g, matched: matches(input.category, g, input.deviceType) }); } }
        catch { failures++; }
        if ([...out.values()].filter(g => g.matched).length >= limit) break;
      }
      if (!out.size && failures === list.length) throw Error('iFixit is unavailable');
      return [...out.values()].sort((a, b) => Number(b.matched) - Number(a.matched)).slice(0, limit);
    })();
    found.catch(() => cache.delete(key));
    cache.set(key, found);
  }
  return found;
}
export function useGuides(input: Input) {
  const [state, setState] = useState<{ key: string; guides?: Guide[]; error?: boolean }>({ key: '' });
  const key = [input.category, input.deviceType || '', ...queries(input)].join('|');
  useEffect(() => {
    let live = true;
    if (!key) { setState({ key, guides: [] }); return; }
    setState({ key });
    findGuides(input).then(guides => { if (live) setState({ key, guides }); }).catch(() => { if (live) setState({ key, error: true }); });
    return () => { live = false; };
  }, [key]);
  return state.key === key ? state : { key };
}
export const easiest = (guides: Guide[]) => [...guides].sort((a, b) => difficultyRank.indexOf(a.difficulty) - difficultyRank.indexOf(b.difficulty))[0];
