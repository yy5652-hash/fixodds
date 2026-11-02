#!/usr/bin/env python3
"""Bake repair places from OpenStreetMap (ODbL) via the QLever SPARQL endpoint into public/places.json."""
import json, re, sys, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

ENDPOINT = 'https://qlever.dev/api/osm-planet'
OUT = Path(__file__).resolve().parents[1] / 'public/places.json'
PRE = 'PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:> PREFIX geo: <http://www.opengis.net/ont/geosparql#> '
# Index in KINDS is what the app stores per place.
KINDS = ['Repair cafe', 'Electronics repair', 'Appliance repair', 'Shop with repair service']
NOT_BIKE = 'FILTER NOT EXISTS { ?o osmkey:shop "bicycle" } FILTER NOT EXISTS { ?o osmkey:amenity "bicycle_repair_station" } '
FILTERS = [
    (0, '?o osmkey:repair "assisted_self_service" . ' + NOT_BIKE),
    (0, '?o osmkey:name ?n0 . FILTER(REGEX(?n0, "^(repair ?caf|reparatur-?caf|repaircaf)", "i")) '),
    (1, '?o osmkey:craft "electronics_repair" . '),
    (2, '?o osmkey:craft "appliance_repair" . '),
] + [(3, f'?o osmkey:shop "{shop}" . ?o <https://www.openstreetmap.org/wiki/Key:{key}> "yes" . ')
     for shop in ('electronics', 'computer', 'mobile_phone', 'appliance', 'hifi', 'vacuum_cleaner', 'sewing')
     for key in ('repair', 'service:repair')]

def run(where):
    query = PRE + 'SELECT ?o ?name ?c ?web WHERE { ' + where + ' ?o geo:hasGeometry/geo:asWKT ?c . OPTIONAL { ?o osmkey:name ?name } OPTIONAL { ?o osmkey:website ?web } }'
    request = urllib.request.Request(ENDPOINT + '?' + urllib.parse.urlencode({'query': query}),
                                     headers={'Accept': 'application/sparql-results+json', 'User-Agent': 'FixOdds data build'})
    with urllib.request.urlopen(request, timeout=170) as response:
        return json.load(response)['results']['bindings']

def main():
    places = {}
    for kind, where in FILTERS:
        try: rows = run(where)
        except Exception as error:
            print('failed', where[:70], error, flush=True)
            if kind == 0 and 'REGEX' in where: continue
            raise
        print(f'{len(rows):6d}  {KINDS[kind]}  {where[:70]}', flush=True)
        for row in rows:
            match = re.search(r'\(+([-\d.]+) ([-\d.]+)', row['c']['value'])
            if not match: continue
            key = row['o']['value']
            if key in places and places[key][3] <= kind: continue
            web = row.get('web', {}).get('value', '')
            places[key] = [round(float(match[2]), 5), round(float(match[1]), 5), row.get('name', {}).get('value', '')[:80], kind,
                           web[:120] if web.startswith(('http://', 'https://')) else '', key.rsplit('/', 2)[-2] + '/' + key.rsplit('/', 1)[-1]]
    if len(places) < 5000: sys.exit(f'Refusing to write: only {len(places)} places.')
    OUT.write_text(json.dumps({'built': date.today().isoformat(), 'source': 'OpenStreetMap contributors, ODbL 1.0', 'kinds': KINDS,
                               'places': sorted(places.values())}, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(len(places), 'places', OUT.stat().st_size, 'bytes')

if __name__ == '__main__': main()
