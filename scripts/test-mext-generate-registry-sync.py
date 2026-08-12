#!/usr/bin/env python3
import importlib.util
import tempfile
from pathlib import Path

SCRIPT=Path(__file__).with_name('mext-generate-registry-sync.py')
spec=importlib.util.spec_from_file_location('sync',SCRIPT); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

registry="""const VERSION = '4.0.0';
const DATASET_SHA256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
// REGISTRY_DATA_START
const ENTRIES = [
  {"name":"テスト","source":{"kind":"mext","itemNo":"00001","officialName":"old","datasetSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","verifiedAt":"2026-01-01","per100g":{"p":1,"f":2,"c":3,"kcal":40,"a":0}},"canonicalId":"mext:00001"}
];
// REGISTRY_DATA_END
"""
report={"generatedAt":"2026-08-12T03:00:00+00:00","source":{"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"entries":[{"name":"テスト","itemNo":"00001","status":"drift","official":{"itemNo":"00001","officialName":"new","p":1.1,"f":2.2,"c":3.3,"kcal":41,"a":0}}]}
with tempfile.TemporaryDirectory() as td:
    path=Path(td)/'registry.js'; path.write_text(registry,encoding='utf-8')
    original,match,entries=m.load_registry(path)
    changes,missing,metadata,sha,verified=m.sync(report,entries)
    assert len(changes)==1 and not missing
    assert len(metadata)==1 and metadata[0]['field']=='datasetSha256'
    assert entries[0]['source']['per100g']=={'p':1.1,'f':2.2,'c':3.3,'kcal':41.0,'a':0.0}
    assert entries[0]['source']['officialName']=='new'
    assert entries[0]['source']['datasetSha256'].startswith('bbbb')
    assert entries[0]['source']['verifiedAt']=='2026-08-12'
    rendered=m.render(original,match,entries,sha)
    path.write_text(rendered,encoding='utf-8')
    _,_,again=m.load_registry(path)
    assert again[0]['source']['per100g']['kcal']==41.0
    assert "const DATASET_SHA256 = 'bbbb" in rendered

    # A second sync against the same official snapshot must be a no-op.
    original2,match2,entries2=m.load_registry(path)
    changes2,missing2,metadata2,sha2,verified2=m.sync(report,entries2)
    rendered2=m.render(original2,match2,entries2,sha2)
    assert not changes2 and not missing2 and not metadata2
    assert rendered2==original2
print('MEXT registry sync generator tests passed.')
