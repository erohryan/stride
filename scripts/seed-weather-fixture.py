#!/usr/bin/env python3
"""Dev fixture: adds a 7-day forecast (hot Thursday 8 Oct), swaps the Wed/Thu sessions
as a weather change set, and logs a run on Mon 5 Oct. Usage: seed-weather-fixture.py <stride.db>"""
import json, sqlite3, sys, uuid

db = sqlite3.connect(sys.argv[1])
def hourly(date, temps, wind=12, cond='Sunny', wdir=200):
    return [{'time': f'{date}T{h:02d}:00', 'tempC': t, 'windKph': wind, 'windDir': wdir, 'precipPct': 0, 'condition': cond}
            for h, t in zip(range(5, 21), temps)]
mild = [13, 14, 15, 17, 19, 20, 21, 22, 22, 21, 21, 20, 19, 18, 17, 16]
days = {
    '2026-10-06': hourly('2026-10-06', [t - 3 for t in mild]),
    '2026-10-07': hourly('2026-10-07', mild, cond='Partly cloudy'),
    '2026-10-08': hourly('2026-10-08', [24, 25, 27, 29, 31, 33, 34, 35, 35, 35, 34, 33, 31, 29, 27, 26], wind=28, wdir=0),
    '2026-10-09': hourly('2026-10-09', mild, cond='Cloudy'),
    '2026-10-10': hourly('2026-10-10', mild, cond='Cloudy'),
    '2026-10-11': hourly('2026-10-11', [t - 4 for t in mild], wind=25, wdir=225),
    '2026-10-12': hourly('2026-10-12', mild, cond='Rain'),
}
for d, h in days.items():
    db.execute('INSERT OR REPLACE INTO forecast (date, data, fetched_at) VALUES (?, ?, ?)',
               (d, json.dumps({'date': d, 'hourly': h}), '2026-10-05T19:30:00.000Z'))

rows = {r[0]: json.loads(r[1]) for r in db.execute("SELECT date, data FROM session WHERE date IN ('2026-10-07','2026-10-08')")}
wed, thu = rows['2026-10-07'], rows['2026-10-08']
before = [wed, thu]
new_wed = {**thu, 'date': '2026-10-07', 'movedFrom': '2026-10-08', 'notes': 'Best window 6–8 am, light wind.'}
new_thu = {**wed, 'date': '2026-10-08', 'movedFrom': '2026-10-07', 'notes': 'Hot day: go before 7 am and keep it easy.'}
for s in (new_wed, new_thu):
    db.execute('UPDATE session SET date = ?, data = ? WHERE id = ?', (s['date'], json.dumps(s), s['id']))
cs = {'id': str(uuid.uuid4()), 'createdAt': '2026-10-05T19:32:00.000Z', 'kind': 'weather',
      'reason': "Thursday is forecast to reach 35° with a hot northerly. Wednesday is 22° and calm, so it gets the tempo. Thursday is now an easy 5 km, best done before 7 am.",
      'before': before, 'after': [new_wed, new_thu], 'reverted': False}
db.execute('INSERT INTO change_set (id, created_at, data) VALUES (?, ?, ?)', (cs['id'], cs['createdAt'], json.dumps(cs)))

run = {'id': str(uuid.uuid4()), 'date': '2026-10-05', 'type': 'easy', 'distanceKm': 6, 'durationSec': 2100, 'effort': 4,
       'splits': [], 'source': 'manual', 'isBenchmark': False}
db.execute('INSERT INTO run (id, date, data) VALUES (?, ?, ?)', (run['id'], run['date'], json.dumps(run)))
db.commit()
print('seeded')
