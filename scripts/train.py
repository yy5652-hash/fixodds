#!/usr/bin/env python3
"""Deterministic local training and data audit. Run from any directory."""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')
import csv, gzip, hashlib, json, re, unicodedata, warnings
from pathlib import Path
from collections import Counter
from datetime import date
import numpy as np
import scipy
from scipy.sparse import csr_matrix
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, roc_auc_score
from sklearn.exceptions import ConvergenceWarning

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
OUT = ROOT / 'src/data'
CLASSES = ['Fixed', 'Repairable', 'End of life']
SEED = 20261101
# Lower bound on P(Fixed)+P(Repairable), mirrored in src/core.ts verdict().
VERDICT_BANDS = [('Repair first',0.8,1.01),('Worth a try',0.65,0.8),('Harder repair, check first',0,0.65)]

def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')

def normalize(s):
    return unicodedata.normalize('NFKC', s).lower().strip()

SYMPTOMS = json.loads((OUT/'symptoms.json').read_text())

def symptom_text(s):
    # Explicit Unicode L/N word scanner, mirrored in src/core.ts: terms match against ' word word '.
    words, word = [], ''
    for char in normalize(s[:1000]):
        if unicodedata.category(char)[0] in ('L', 'N'):
            word += char
        else:
            if word: words.append(word)
            word = ''
    if word: words.append(word)
    return ' ' + ' '.join(words) + ' '

def symptoms(s):
    # The ORDS problem field is mostly written after the repair, so free words leak the outcome.
    # Only a curated list of symptoms a person can report beforehand reaches the model.
    text = symptom_text(s)
    return sorted(k for k, v in SYMPTOMS.items() if any(t in text for t in v['terms']))

def age_bucket(s):
    try: age = float(s)
    except (ValueError, TypeError): return 'unknown'
    if not np.isfinite(age) or age < 0 or age > 150: return 'unknown'
    return '0-2' if age < 3 else '3-5' if age < 6 else '6-10' if age < 11 else '11-20' if age < 21 else '21+'

def fields(r):
    return {'category': r['product_category'], 'age': age_bucket(r['product_age']), 'brand': r['brand'][:80], 'problem': r['problem'][:1000]}

def features(r, brands, text=True):
    brand = normalize(r['brand'])
    base = ['c:' + r['category'], 'a:' + r['age'], 'b:' + (brand if brand in brands else 'other' if brand else 'unknown')]
    if not text: return base
    found = symptoms(r['problem'])
    return base + ['s:' + x for x in found] + ['x:' + r['category'] + '|' + x for x in found]

def make_names(df):
    # Train-only pruning of rare category-by-symptom interactions. Binary features.
    return sorted(f for f, n in df.items() if not f.startswith('x:') or n >= 40)

def matrix(rows, vocab, brands, text=True):
    indices, indptr = [], [0]
    for r in rows:
        indices.extend(sorted(vocab[f] for f in features(r, brands, text) if f in vocab))
        indptr.append(len(indices))
    return csr_matrix((np.ones(len(indices)), indices, indptr), shape=(len(rows), len(vocab)))

def metrics(y, p):
    bins = []
    for i in range(10):
        selected = (p[:, 0] >= i / 10) & (p[:, 0] < (i + 1) / 10 if i < 9 else p[:, 0] <= 1)
        n = int(selected.sum())
        bins.append({'lower': i/10, 'upper': (i+1)/10, 'n': n,
                     'predicted': float(p[selected, 0].mean()) if n else None,
                     'observed': float((y[selected] == 0).mean()) if n else None})
    return {'logLoss': float(log_loss(y, p, labels=[0, 1, 2])),
            'brier': float(np.mean(np.sum((p - np.eye(3)[y])**2, axis=1))),
            'aucFixed': float(roc_auc_score(y == 0, p[:, 0])),
            'aucEndOfLife': float(roc_auc_score(y == 2, p[:, 2])), 'calibration': bins}

def make_factors(categories):
    # IDs are used ONLY to join Restart's own migrations. ORDS is mapped by name below.
    init = (RAW/'init_db.php').read_text()
    names = {int(i): name.replace('\\"', '"') for i, name in re.findall(r'\((\d+), "((?:\\.|[^"\\])*)",', init)}
    fix = (RAW/'fix_names.php').read_text().split('public function down')[0]
    names.update({int(i): n for i,n in re.findall(r"(\d+) => '([^']+)'", fix)})
    up = (RAW/'lca_migration.php').read_text().split('public function down')[0]
    names.update({int(i): n for i,n in re.findall(r"'idcategories' => (\d+),\s*'name' => '([^']+)'", up)})
    values = {int(i): (float(w),float(f)) for i,w,f in re.findall(r"\['idcategories' => '(\d+)', 'weight' => '([\d.]+)', 'footprint' => '([\d.]+)'\]", up)}
    by_name = {names[i]: (i,*v) for i,v in values.items() if i in names}
    source = 'Restart 2021_08_13_000439_update_lca_unpowered_categories.php up(); names from initialise_fixometer_db.php and fix_category_names.php.'
    mapping = {'Laptop': ['Laptop medium','Laptop small','Laptop large'],
               'Flat screen': ['Flat screen 22-24"','Flat screen 15-17"','Flat screen 19-20"','Flat screen 26-30"','Flat screen 32-37"'],
               'Hair dryer': ['Hair & beauty item'], 'Food processor': ['Small kitchen item']}
    rows = {}
    for category in categories:
        targets = mapping.get(category, [category])
        variants = []
        for name in targets:
            if name in by_name:
                i,w,f = by_name[name]
                if w > 0 and f > 0:
                    variants.append({'name':name,'restartId':i,'weight':w,'footprint':f})
        estimated = category in ('Hair dryer','Food processor')
        note = source
        if estimated: note += ' Broader-category proxy; estimated, not a device-specific measurement.'
        if not variants: note = 'Unquantified: no positive, name-matched electrical factor and no measured item weight. Do not substitute ORDS IDs or non-electrical categories.'
        rows[category] = {'default': variants[0]['name'] if variants else None,'estimated':estimated,'variants':variants,'source':note}
    write(OUT/'factors.json', {'displacement':0.5,'poweredEmissionRatio':32.06679233,'categories':rows,
          'source':'The Restart Project restarters.net; .env.example DISPLACEMENT_VALUE and EMISSION_RATIO_POWERED. Factors are category averages.'})
    lines = ['# Auditable factor mapping', '', 'All weights are kg and footprints kg CO2e before displacement. **Only `up()` values** are read: `up()` updates category revision to 2; `down()` reverses the migration and contains the previous values. ORDS IDs are never used to join Restart IDs.', '',
             'Sources: [LCA migration](https://github.com/TheRestartProject/restarters.net/blob/master/database/migrations/2021_08_13_000439_update_lca_unpowered_categories.php), [initial category names](https://github.com/TheRestartProject/restarters.net/blob/master/database/migrations/2018_04_19_102108_initialise_fixometer_db.php), [name corrections](https://github.com/TheRestartProject/restarters.net/blob/master/database/migrations/2021_10_04_124708_fix_category_names.php), [.env.example](https://github.com/TheRestartProject/restarters.net/blob/master/.env.example). Local source SHA-256 hashes are in report.json.', '',
             'Default laptop: medium. Default screen: 22–24 inches. These are explicit choices, not averages or inferred sizes. Screens outside the supported sizes have no specific factor. Hair dryer uses the broader Hair & beauty item category (the Restart description explicitly includes dryers); Food processor uses Small kitchen item. Both are labelled estimated. Battery/charger/adapter, Large home electrical, Small home electrical and Misc remain unquantified. No measured weight is available, so the powered emission ratio (32.06679233 kg CO2e/kg) is documented but not used to invent weights.', '',
             'Expected CO2e = P(Fixed) × footprint × 0.5. Full-success CO2e = footprint × 0.5. Expected e-waste = P(Fixed) × weight; full success = weight. Logged Fixed outcomes use full-success estimates, not measured environmental savings.', '', '| ORDS name | Restart name (Restart ID) | kg | kg CO2e | Default / qualification |','|---|---|---:|---:|---|']
    for cat,row in rows.items():
        if not row['variants']: lines.append(f'| {cat} | — | — | — | Unquantified |')
        for v in row['variants']:
            lines.append(f"| {cat} | {v['name']} ({v['restartId']}) | {v['weight']} | {v['footprint']} | {'Default' if row['default']==v['name'] else 'Size option'}{' · estimated proxy' if row['estimated'] else ''} |")
    (ROOT/'docs/factors.md').write_text('\n'.join(lines)+'\n')


def main():
    rows = list(csv.DictReader((RAW/'eee.csv').open()))
    raw_count = len(rows)
    rows = [r for r in rows if r['repair_status'] in CLASSES]
    # Invalid dates and unknown group membership cannot demonstrate split isolation.
    valid = []
    for r in rows:
        try: date.fromisoformat(r['event_date'])
        except ValueError: continue
        if r['group_identifier'].strip(): valid.append(r)
    latest = max(r['event_date'] for r in valid)
    end = date.fromisoformat(latest)
    month_index = end.year*12 + end.month-1 - 17
    cutoff = date(month_index//12, month_index%12+1, 1).isoformat()
    # Out of time and group-disjoint: 30% of groups are held out for evaluation only.
    held_out = lambda g: int(hashlib.sha256(f'{SEED}:{g}'.encode()).hexdigest(), 16) % 10 < 3
    test = [r for r in valid if r['event_date'] >= cutoff and held_out(r['group_identifier'])]
    test_groups = {r['group_identifier'] for r in test}
    train = [r for r in valid if r['event_date'] < cutoff and not held_out(r['group_identifier'])]
    train_groups = {r['group_identifier'] for r in train}
    assert not train_groups & test_groups
    assert max(r['event_date'] for r in train) < min(r['event_date'] for r in test)
    print(f'Train {len(train)} / test {len(test)} / excluded {len(valid)-len(train)-len(test)}; cutoff {cutoff}', flush=True)
    tr, te = [fields(r) for r in train], [fields(r) for r in test]
    ytr = np.array([CLASSES.index(r['repair_status']) for r in train])
    yte = np.array([CLASSES.index(r['repair_status']) for r in test])
    brands = [x for x,n in Counter(normalize(r['brand']) for r in tr if r['brand']).most_common(60)]
    df = Counter(f for r in tr for f in features(r, brands))
    names = make_names(df)
    vocab = {f:i for i,f in enumerate(names)}
    xtr, xte = matrix(tr,vocab,brands), matrix(te,vocab,brands)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always', ConvergenceWarning)
        clf = LogisticRegression(C=1.0, max_iter=4000, tol=1e-7, solver='lbfgs', random_state=SEED).fit(xtr,ytr)
    assert list(clf.classes_) == [0,1,2]
    p = clf.predict_proba(xte)
    counts = np.bincount(ytr,minlength=3)
    global_p = (counts+1)/(len(train)+3)
    cat_counts = {}
    for r,y in zip(tr,ytr):
        cat_counts.setdefault(r['category'], np.zeros(3))[y] += 1
    category_p = np.array([(cat_counts.get(r['category'],np.zeros(3))+10*global_p)/(cat_counts.get(r['category'],np.zeros(3)).sum()+10) for r in te])
    # Ablation separates the benefit of text from age and brand, without tuning on test.
    no_text_vocab = {f:i for i,f in enumerate(f for f in names if not f.startswith(('s:','x:')))}
    ablation = LogisticRegression(C=1.0,max_iter=4000,tol=1e-7,solver='lbfgs',random_state=SEED).fit(matrix(tr,no_text_vocab,brands,False),ytr)
    no_text_p = ablation.predict_proba(matrix(te,no_text_vocab,brands,False))
    # Verdict bands, read on the held-out set only.
    feasible = p[:,0]+p[:,1]
    bands = []
    for name, low, high in VERDICT_BANDS:
        keep = (feasible >= low) & (feasible < high)
        bands.append({'verdict':name,'low':low,'n':int(keep.sum()),'share':float(keep.mean()),**({'predictedFeasible':float(feasible[keep].mean()),'observedFixed':float((yte[keep]==0).mean()),'observedRepairable':float((yte[keep]==1).mean()),'observedEndOfLife':float((yte[keep]==2).mean())} if keep.any() else {})})
    # The shipped model is refit on every usable record with the same recipe; the metrics above stay held-out.
    full = [fields(r) for r in valid]
    yfull = np.array([CLASSES.index(r['repair_status']) for r in valid])
    full_brands = [x for x,n in Counter(normalize(r['brand']) for r in full if r['brand']).most_common(60)]
    full_names = make_names(Counter(f for r in full for f in features(r, full_brands)))
    full_vocab = {f:i for i,f in enumerate(full_names)}
    shipped = LogisticRegression(C=1.0,max_iter=4000,tol=1e-7,solver='lbfgs',random_state=SEED).fit(matrix(full,full_vocab,full_brands),yfull)
    model = {'version':2,'classes':CLASSES,'brands':full_brands,'features':full_names,'coefficients':[[round(v,6) for v in row] for row in shipped.coef_.T.tolist()],'intercept':[round(v,6) for v in shipped.intercept_.tolist()],'tokenizer':{'normalization':'NFKC lowercase','maxCharacters':1000,'symptoms':'src/data/symptoms.json','binary':True},'trainedOnRows':len(full)}
    write(ROOT/'public/model.json',model)
    model_bytes = (ROOT/'public/model.json').read_bytes()
    compressed = gzip.compress(model_bytes,mtime=0)
    assert len(compressed) < 1_500_000
    # Golden inputs are held-out rows, IDs omitted; probabilities use the rounded shipped coefficients. Texts are public ORA data, not user data.
    sampled = np.random.default_rng(SEED).choice(len(te),200,replace=False)
    golden_p = (matrix(te,full_vocab,full_brands)@np.array(model['coefficients'])+np.array(model['intercept']))
    golden_p = np.exp(golden_p-golden_p.max(axis=1,keepdims=True)); golden_p /= golden_p.sum(axis=1,keepdims=True)
    write(OUT/'golden.json',[{'input':te[i],'probabilities':golden_p[i].tolist()} for i in sampled])
    categories = sorted(set(r['product_category'] for r in rows))
    stats = {}
    for cat in categories:
        rr = [r for r in rows if r['product_category']==cat]
        barriers = Counter(r['repair_barrier_if_end_of_life'] for r in rr if r['repair_status']=='End of life' and r['repair_barrier_if_end_of_life'])
        ages = [float(r['product_age']) for r in rr if age_bucket(r['product_age'])!='unknown']
        total = sum(barriers.values())
        stats[cat] = {'n':len(rr),'statusCounts':dict(Counter(r['repair_status'] for r in rr)), 'barrierN':total,'barriers':[{'name':b,'n':n,'share':n/total} for b,n in barriers.most_common()], 'medianAge':float(np.median(ages)) if ages else None,'ageN':len(ages),'ordsId':next(r['product_category_id'] for r in rr)}
    write(OUT/'stats.json',stats)
    make_factors(categories)
    report = {'rawRows':raw_count,'knownRows':len(rows),'unknownDropped':raw_count-len(rows),'invalidDateOrGroupDropped':len(rows)-len(valid),'classes':CLASSES,'seed':SEED,
      'split':{'cutoff':cutoff,'lastEvent':latest,'trainN':len(train),'testN':len(test),'excludedByDesign':len(valid)-len(train)-len(test),'trainGroups':len(train_groups),'testGroups':len(test_groups),'groupOverlap':0,'trainStart':min(r['event_date'] for r in train),'trainEnd':max(r['event_date'] for r in train),'testStart':min(r['event_date'] for r in test),'testEnd':latest,'trainCounts':dict(zip(CLASSES,counts.tolist())),'testCounts':dict(Counter(r['repair_status'] for r in test))},
      'verdictBands':bands,'metrics':{'global':metrics(yte,np.tile(global_p,(len(te),1))),'category':metrics(yte,category_p),'withoutSymptoms':metrics(yte,no_text_p),'model':metrics(yte,p)},
      'model':{'bytes':len(model_bytes),'gzipBytes':len(compressed),'features':len(names),'symptoms':len(SYMPTOMS),'trainedOnRows':len(full),'iterations':int(clf.n_iter_[0]),'converged':not any(isinstance(w.message,ConvergenceWarning) for w in caught),'sha256':hashlib.sha256(model_bytes).hexdigest(),'C':1.0},
      'versions':{'numpy':np.__version__,'scipy':scipy.__version__,'sklearn':sklearn.__version__},
      'sources':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(RAW.iterdir()) if f.is_file()},
      'limitations':['Community events, not paid repair shops; self-reported outcomes; selection bias.', 'The problem field is mostly written after the repair, so free words reveal the outcome (a free-text model reached AUC 0.81 on words like replaced or not repairable). Only 21 symptoms a person can report beforehand are used, which is why the headline accuracy is modest.', 'No test-set tuning or recalibration; displayed probabilities are estimates, not guarantees.', 'Brier is mean sum of squared errors over all three classes (range 0 to 2). Category baseline uses 10 pseudo-observations at train global rates; global uses Laplace smoothing.', 'Impact is a category-average estimate with 0.5 displacement, excluding repair transport, parts, rebound and energy-efficiency changes.']}
    write(OUT/'report.json',report)
    print(json.dumps(bands,indent=0),flush=True)
    print(json.dumps({k:{m:round(v,5) for m,v in d.items() if m!='calibration'} for k,d in report['metrics'].items()},indent=2),flush=True)
    print('Model gzip bytes:',len(compressed),'converged:',report['model']['converged'],flush=True)

if __name__=='__main__': main()
