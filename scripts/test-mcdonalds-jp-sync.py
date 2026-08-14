#!/usr/bin/env python3
import importlib.util
import json
import tempfile
from pathlib import Path

SCRIPT=Path(__file__).with_name('mcdonalds-jp-sync.py')
spec=importlib.util.spec_from_file_location('sync',SCRIPT); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

registry="""const VERSION = '7.0.0';
const VERIFIED_AT = '2026-01-01';
// RESTAURANT_DATA_START
const ENTRIES = [
  {"name":"テスト","canonicalId":"restaurant:mcd-jp:test","providerKey":"Test","sourceMode":"nutrition-list","officialName":"Old","sourceUrl":"https://old.example/","nutrition":{"p":1,"f":2,"c":3,"kcal":40,"a":0}}
];
// RESTAURANT_DATA_END
"""
report={"generatedAt":"2026-08-12T04:00:00+00:00","sourceSnapshotSha256":"abc","entries":[{"name":"テスト","canonicalId":"restaurant:mcd-jp:test","status":"drift","official":{"officialName":"New","sourceUrl":"https://www.mcdonalds.co.jp/en/allergy/","nutrition":{"p":1.1,"f":2.2,"c":3.3,"kcal":41,"a":0}}}]}
with tempfile.TemporaryDirectory() as td:
    path=Path(td)/'registry.js'; path.write_text(registry,encoding='utf-8')
    original,match,entries=m.load_registry(path)
    changes,missing,verified=m.sync(report,entries)
    assert len(changes)==1 and not missing and verified=='2026-08-12'
    assert entries[0]['nutrition']['kcal']==41
    assert entries[0]['officialName']=='New'
    assert entries[0]['sourceUrl'].startswith('https://www.mcdonalds.co.jp/')
    rendered=m.render(original,match,entries,verified)
    assert "const VERIFIED_AT = '2026-08-12';" in rendered
    path.write_text(rendered,encoding='utf-8')
    original2,match2,entries2=m.load_registry(path)
    changes2,missing2,verified2=m.sync(report,entries2)
    assert not changes2 and not missing2
    assert m.render(original2,match2,entries2,verified2)==original2.replace("const VERIFIED_AT = '2026-08-12';","const VERIFIED_AT = '2026-08-12';")
print("McDonald's Japan registry sync tests passed.")
