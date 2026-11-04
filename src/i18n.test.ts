import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dictionary, initialLang, langs, locale, setLanguage, t } from './i18n';
import { barrierActions, categories, englishLabel, label, safety, symptomData, verdict, type Input } from './core';
import { number, date } from './format';
import { slug } from './records';
import { enquiryText } from './enquiry';

const translated = langs.filter(l => l.code !== 'en');
const placeholders = (text: string) => [...new Set(text.match(/\{\w+\}/g) || [])].sort();
afterEach(() => { setLanguage('en'); vi.unstubAllGlobals(); });

describe('translation coverage', () => {
  it('has all four translations and preserves every placeholder', () => {
    for (const [source, entry] of Object.entries(dictionary)) for (const { code } of translated) {
      const value = entry[code as keyof typeof entry];
      expect(value?.trim(), `${code}: ${source}`).toBeTruthy();
      expect(placeholders(value), `${code}: ${source}`).toEqual(placeholders(source));
    }
  });
  it('covers every literal t() call in src/**/*.tsx', () => {
    function scan(folder: string) {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) scan(path);
        else if (entry.name.endsWith('.tsx')) {
          const source = readFileSync(path, 'utf8');
          for (const match of source.matchAll(/\bt\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g)) {
            const key: string = Function(`return ${match[1]}`)();
            expect(Object.hasOwn(dictionary, key), `${path}: ${key}`).toBe(true);
          }
        }
      }
    }
    scan(join(import.meta.dirname));
  });
  it('covers data labels, barriers, outcomes, verdicts and safety reasons', () => {
    const input: Input = { category: 'Large home electrical', age: 'unknown', brand: '', problem: 'swollen battery smoke gas water leak microwave open power supply' };
    const keys = [...categories.map(englishLabel), ...Object.values(symptomData).map(s => s.label), ...Object.keys(barrierActions), ...Object.values(barrierActions), ...safety(input), 'Fixed', 'More work or parts', 'End of life', ...[0,.7,.9].map(verdict)];
    for (const key of keys) expect(Object.hasOwn(dictionary, key), key).toBe(true);
  });
});

it('falls back to English and substitutes placeholders without interpreting replacement characters', () => {
  setLanguage('zh');
  expect(t('Unlisted {name}', { name: '$&' })).toBe('Unlisted $&');
  expect(t('Check my {item}', { item: 'MacBook' })).toBe('检测我的MacBook');
  expect(t('Check my {item}')).toBe('检测我的{item}');
});
it('formats numbers and dates with the active locale', () => {
  for (const [lang, expected] of [['de','de-DE'],['fr','fr-FR'],['zh','zh-CN'],['nl','nl-NL'],['en','en-GB']] as const) {
    setLanguage(lang);
    expect(locale()).toBe(expected);
    expect(number(1234.5,1)).toBe((1234.5).toLocaleString(expected,{minimumFractionDigits:1,maximumFractionDigits:1}));
    expect(date('2030-01-05')).toBe(new Date('2030-01-05T12:00:00').toLocaleDateString(expected));
  }
});
it('uses a valid stored preference before the browser language and tolerates blocked storage', () => {
  vi.stubGlobal('navigator', { language: 'fr-CA' });
  vi.stubGlobal('localStorage', { getItem: () => 'de', setItem: vi.fn() });
  expect(initialLang()).toBe('de');
  vi.stubGlobal('localStorage', { getItem: () => 'invalid', setItem: () => { throw Error('blocked'); } });
  expect(initialLang()).toBe('fr');
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } });
  for (const [language, expected] of [['nl-BE','nl'],['de-AT','de'],['zh-TW','zh'],['es-ES','en'],['en-US','en']] as const) {
    vi.stubGlobal('navigator', { language });
    expect(initialLang()).toBe(expected);
  }
  expect(() => setLanguage('nl')).not.toThrow();
});
it('keeps data identifiers, routes, model verdicts and repairer messages in English', () => {
  const input: Input = { category: 'Vacuum', age: 'unknown', brand: '', problem: '', symptoms: ['no_power'] };
  const message = enquiryText(input, 'https://example.org/#/ticket');
  for (const { code } of translated) {
    setLanguage(code);
    expect(label('Vacuum')).not.toBe('Vacuum');
    expect(slug('Vacuum')).toBe('vacuum');
    expect(verdict(.9)).toBe('Repair first');
    expect(enquiryText(input, 'https://example.org/#/ticket')).toBe(message);
  }
});
