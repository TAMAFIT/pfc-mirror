#!/usr/bin/env python3
import importlib.util
import tempfile
from pathlib import Path
from openpyxl import Workbook

SCRIPT = Path(__file__).with_name('mext-reconcile.py')
spec = importlib.util.spec_from_file_location('mext_reconcile', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

assert mod.norm_item(6007) == '06007'
assert mod.norm_item('17007') == '17007'
assert mod.num('(0)') == 0.0
assert mod.num('Tr') == 0.0
assert mod.num('-') is None

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    wb = Workbook()
    ws = wb.active
    ws.title = '第2章'
    ws['A1'] = '食品番号'
    ws['B1'] = '食品名'
    ws.merge_cells('C1:D1')
    ws['C1'] = 'エネルギー'
    ws['C2'] = 'kJ'
    ws['D2'] = 'kcal'
    ws['E1'] = 'たんぱく質'
    ws['F1'] = '脂質'
    ws['G1'] = '炭水化物'
    ws['H1'] = 'アルコール'
    ws.cell(4, 1, 17007)
    ws.cell(4, 2, 'こいくちしょうゆ')
    ws.cell(4, 3, 318)
    ws.cell(4, 4, 76)
    ws.cell(4, 5, 7.7)
    ws.cell(4, 6, 0.0)
    ws.cell(4, 7, 7.9)
    ws.cell(4, 8, 2.1)
    xlsx = root / 'fixture.xlsx'
    wb.save(xlsx)

    rows, sheet, cols = mod.load_rows(xlsx)
    assert sheet == '第2章'
    assert cols['kcal'] == 4
    assert rows['17007']['kcal'] == 76.0
    assert rows['17007']['p'] == 7.7
    assert rows['17007']['a'] == 2.1

    js = root / 'verified.js'
    js.write_text("""
    const VERIFIED = [{
      name: 'こいくち醤油',
      source: { kind: 'mext', itemNo: '17007', per100g: { p: 7.7, f: 0.0, c: 7.9, kcal: 76, a: 2.1 } }
    }];
    """, encoding='utf-8')
    entries = mod.verified([js])
    result = mod.reconcile(entries, rows)[0]
    assert result['status'] == 'confirmed'
    assert result['confidence'] == 'high'

    rows['17007']['kcal'] = 77.0
    drift = mod.reconcile(entries, rows)[0]
    assert drift['status'] == 'drift'
    assert drift['confidence'] == 'review'
    assert drift['changedFields'] == ['kcal']

print('MEXT reconciliation unit tests passed.')
