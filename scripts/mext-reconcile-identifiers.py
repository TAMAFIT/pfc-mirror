#!/usr/bin/env python3
import importlib.util
import json
import re
import sys
import urllib.parse
from pathlib import Path

SCRIPT = Path(__file__).with_name('mext-reconcile.py')
spec = importlib.util.spec_from_file_location('mext_reconcile_core', SCRIPT)
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


def discover_main_workbook(page=core.MEXT_PAGE):
    body, _ = core.fetch_bytes(page)
    parser = core.Links()
    parser.feed(body.decode('utf-8', 'replace'))
    candidates = []
    seen = []
    for href, label in parser.links:
        if not href:
            continue
        url = urllib.parse.urljoin(page, href)
        if not url.lower().endswith(('.xlsx', '.xls')):
            continue
        normalized = re.sub(r'\s+', '', label).lstrip('・･')
        seen.append((normalized, url))
        if '第2章（データ）' in normalized and all(x not in normalized for x in ('本表', '第1表', '第2表', '第3表', '第4表', '別表')):
            candidates.append((url, label))
    if len(candidates) != 1:
        raise RuntimeError(f'Expected exactly one MEXT main-table workbook link, found {len(candidates)}; excel links={seen}')
    return candidates[0]


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

        def normalized_values(vals):
            return [re.sub(r'\s+', '', str(v)).upper() for v in vals]

        def has_code(vals, pattern):
            return any(re.fullmatch(pattern, v) for v in normalized_values(vals))

        food = pick(lambda t, v: 300 if '食品番号' in t else 0)
        name = pick(lambda t, v: 300 if '食品名' in t else 0)
        kcal = pick(lambda t, v: 1200 if has_code(v, r'ENERC_KCAL') else 0)
        protein = pick(lambda t, v: 1100 if has_code(v, r'PROT(?:[-_].*)?') else 0)
        fat = pick(lambda t, v: 1100 if has_code(v, r'FAT(?:[-_].*)?') else 0)
        carbs = pick(lambda t, v: 1100 if has_code(v, r'CHOCDF(?:[-_].*)?') else 0)
        alcohol = pick(lambda t, v: 1000 if has_code(v, r'ALC(?:[-_].*)?') else 0)

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
        concise = {}
        for ws in workbook.worksheets[:2]:
            rows = []
            for col in range(1, min(ws.max_column, 55) + 1):
                vals = [core.text(ws.cell(r, col).value) for r in range(1, min(ws.max_row, 9) + 1)]
                if any(vals):
                    rows.append({'col': col, 'header': vals})
            concise[ws.title] = rows
        print('MEXT_HEADER_COLUMNS ' + json.dumps(concise, ensure_ascii=False), file=sys.stderr)
        print('MEXT_IDENTIFIER_DIAGNOSTICS ' + json.dumps(diagnostics[:2], ensure_ascii=False), file=sys.stderr)
        raise RuntimeError('Could not locate MEXT component identifier columns')
    return best[1], best[2]


def parse_registry(path):
    text = Path(path).read_text(encoding='utf-8')
    match = re.search(r'// REGISTRY_DATA_START\s*const ENTRIES\s*=\s*(\[[\s\S]*?\]);\s*// REGISTRY_DATA_END', text)
    if not match:
        return None
    rows = json.loads(match.group(1))
    out = []
    for entry in rows:
        source = entry.get('source') or {}
        per100g = source.get('per100g') or {}
        if source.get('kind') != 'mext':
            continue
        out.append({
            'file': str(path),
            'name': entry.get('name'),
            'itemNo': core.norm_item(source.get('itemNo')),
            'per100g': {k: float(per100g.get(k, 0) or 0) for k in ('p','f','c','kcal','a')}
        })
    return out


def registry_aware_verified(paths):
    out = []
    for path in paths:
        registry = parse_registry(path)
        if registry is not None:
            out.extend(registry)
        else:
            out.extend(_base_verified([path]))
    if not out:
        raise RuntimeError('No MEXT entries parsed from source files')
    return out


def reconcile_blank_alcohol_as_zero(entries, rows):
    normalized = {}
    for item_no, row in rows.items():
        copied = dict(row)
        if copied.get('a') is None:
            copied['a'] = 0.0
        normalized[item_no] = copied
    return _base_reconcile(entries, normalized)


_base_verified = core.verified
_base_reconcile = core.reconcile
core.discover_workbook = discover_main_workbook
core.pick_columns = pick_columns_by_identifier
core.verified = registry_aware_verified
core.reconcile = reconcile_blank_alcohol_as_zero

if __name__ == '__main__':
    sys.exit(core.main())
