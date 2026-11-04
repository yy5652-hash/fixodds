"""Per-category repair records for the category pages, brand repair records and similar real cases.

Reads data/raw/eee.csv (Open Repair Alliance, CC BY-SA 4.0) and writes:
  public/insights.json     outcome counts by age, brand, country, provider, year and symptom
  public/cases/<n>.json    a seeded random sample of real records per category, for "similar cases"
Run after scripts/train.py with the same .venv. Counts are raw outcome counts; nothing here is modelled.
"""
import csv, json, random, re
from collections import Counter, defaultdict
from train import CLASSES, ROOT, RAW, SEED, age_bucket, symptoms, write

OUT = ROOT / 'public'
AGES = ['0-2', '3-5', '6-10', '11-20', '21+']
NO_BRAND = {'', 'unknown', 'other', 'n/a', 'na', 'none', 'generic', 'no brand', 'nobrand', 'unbranded', 'no name', 'noname', 'diverse', 'divers', 'onbekend', 'unbekannt', 'inconnu', '?', '-'}
BRAND_ALIASES = {'phillips': 'philips', 'delonghi': "de'longhi", 'de longhi': "de'longhi", 'hewlett packard': 'hp', 'hewlettpackard': 'hp', 'black decker': 'black+decker', 'black and decker': 'black+decker', 'black & decker': 'black+decker', 'russel hobbs': 'russell hobbs', 'kitchen aid': 'kitchenaid'}
CONTACT = re.compile(r'@|https?:|www\.|\d{6,}|\+\d{2}', re.I)
SYMPTOM_IDS = list(json.loads((ROOT / 'src/data/symptoms.json').read_text()))
CATEGORIES = list(json.loads((ROOT / 'src/data/stats.json').read_text()))
MIN_BRAND = 40
CASES_PER_CATEGORY = 300

def brand_key(raw):
    b = re.sub(r'\s+', ' ', raw.strip().lower())
    b = BRAND_ALIASES.get(b, b)
    return '' if b in NO_BRAND else b

def outcome(rows):
    c = Counter(r['repair_status'] for r in rows)
    return [len(rows), c['Fixed'], c['Repairable']]

def main():
    rows = [r for r in csv.DictReader((RAW / 'eee.csv').open()) if r['repair_status'] in CLASSES and r['product_category'] in CATEGORIES]
    by_cat = defaultdict(list)
    for r in rows: by_cat[r['product_category']].append(r)
    rng = random.Random(SEED)
    insights = {}
    (OUT / 'cases').mkdir(exist_ok=True)
    for ci, cat in enumerate(CATEGORIES):
        rr = by_cat[cat]
        for r in rr: r['_sym'] = symptoms(r['problem'])
        ages = {a: outcome([r for r in rr if age_bucket(r['product_age']) == a]) for a in AGES}
        brands = defaultdict(list); names = defaultdict(Counter)
        for r in rr:
            k = brand_key(r['brand'])
            if k: brands[k].append(r); names[k][r['brand'].strip()] += 1
        brand_rows = sorted(([names[k].most_common(1)[0][0], *outcome(v)] for k, v in brands.items() if len(v) >= MIN_BRAND), key=lambda x: -x[1])[:30]
        countries = defaultdict(list)
        for r in rr: countries[r['country']].append(r)
        country_rows = sorted(([k, *outcome(v)] for k, v in countries.items() if k and len(v) >= 50), key=lambda x: -x[1])[:10]
        providers = defaultdict(list)
        for r in rr: providers[r['data_provider']].append(r)
        provider_rows = sorted(([k, *outcome(v)] for k, v in providers.items() if len(v) >= 50), key=lambda x: -x[1])
        years = defaultdict(list)
        for r in rr:
            if re.match(r'^20\d\d', r['event_date']): years[r['event_date'][:4]].append(r)
        year_rows = [[y, *outcome(years[y])] for y in sorted(years) if len(years[y]) >= 30]
        sym = defaultdict(list)
        for r in rr:
            for s in r['_sym']: sym[s].append(r)
        symptom_rows = sorted(([s, *outcome(v)] for s, v in sym.items() if len(v) >= 30), key=lambda x: -x[1])[:10]
        insights[cat] = {'all': outcome(rr), 'ages': [[a, *ages[a]] for a in AGES], 'brands': brand_rows, 'countries': country_rows, 'providers': provider_rows, 'years': year_rows, 'symptoms': symptom_rows, 'case': ci}
        pool = [r for r in rr if 20 <= len(r['problem'].strip()) <= 400 and not CONTACT.search(r['problem'])]
        sample = rng.sample(pool, min(CASES_PER_CATEGORY, len(pool)))
        cases = [[CLASSES.index(r['repair_status']), r['brand'].strip()[:40] if brand_key(r['brand']) else '', r['product_age'][:5] if age_bucket(r['product_age']) != 'unknown' else '', r['country'], r['event_date'][:4], re.sub(r'\s+', ' ', r['problem'].strip())[:300], [SYMPTOM_IDS.index(s) for s in r['_sym']], r['data_provider']] for r in sample]
        write(OUT / 'cases' / f'{ci}.json', {'fields': ['status', 'brand', 'age', 'country', 'year', 'problem', 'symptoms', 'provider'], 'cases': cases})
    write(OUT / 'insights.json', {'source': 'Open Repair Alliance dataset v0.3 (CC BY-SA 4.0)', 'minBrand': MIN_BRAND, 'fields': ['name', 'n', 'fixed', 'repairable'], 'categories': insights})
    print(len(rows), 'rows,', sum(len(v['brands']) for v in insights.values()), 'brand rows')

if __name__ == '__main__':
    main()
