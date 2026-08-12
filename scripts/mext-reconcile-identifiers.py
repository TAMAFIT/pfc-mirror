#!/usr/bin/env python3
import importlib.util
import json
import sys
from pathlib import Path

SCRIPT = Path(__file__).with_name('mext-reconcile.py')
spec = importlib.util.spec_from_file_location('mext_reconcile_core', SCRIPT)
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


def pick_columns_by_identifier(workbook):
    best = None
    diagnostics = []
    for ws in workbook.worksheets:
        values, tokens = core.expanded_header_map(ws)

        def pick(fn):
            hits = []
            for col, token in tokens.items():
                score = fn(token, values[col])
                if score:
                    hits.append((score, col, token))
            return sorted(hits, reverse=True)[0] if hits else None

        def has_id(vals, identifier):
            wanted = identifier.upper()
            return any(str(v).strip().upper() == wanted for v in vals)

        food = pick(lambda t, v: 300 if '食品番号' in t else 0)
        name = pick(lambda t, v: 300 if '食品名' in t else 0)
        kcal = pick(lambda t, v: 1000 if has_id(v, 'ENERC_KCAL') else 0)
        protein = pick(lambda t, v: 1000 if has_id(v, 'PROT') else 0)
        fat = pick(lambda t, v: 1000 if has_id(v, 'FAT') else 0)
        carbs = pick(lambda t, v: 1000 if has_id(v, 'CHOCDF') else 0)
        alcohol = pick(lambda t, v: 1000 if has_id(v, 'ALC') else 0)
        required = [food, name, kcal, protein, fat, carbs]
        diagnostics.append((ws.title, {
            key: [hit[1], hit[2]] if hit else None
            for key, hit in [('food', food), ('name', name), ('kcal', kcal), ('p', protein), ('f', fat), ('c', carbs), ('a', alcohol)]
        }))
        if all(required):
            score = sum(hit[0] for hit in required) + (alcohol[0] if alcohol else 0)
            candidate = (score, ws, {
                'food_no': food[1], 'food_name': name[1],
                'kcal': kcal[1], 'p': protein[1], 'f': fat[1], 'c': carbs[1],
                'a': alcohol[1] if alcohol else None,
            })
            if best is None or candidate[0] > best[0]:
                best = candidate

    if not best:
        print('MEXT_IDENTIFIER_DIAGNOSTICS ' + json.dumps(diagnostics, ensure_ascii=False), file=sys.stderr)
        raise RuntimeError('Could not locate MEXT component identifier columns')
    return best[1], best[2]


core.pick_columns = pick_columns_by_identifier

if __name__ == '__main__':
    sys.exit(core.main())
