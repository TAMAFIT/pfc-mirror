#!/usr/bin/env python3
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

START='// REGISTRY_DATA_START'
END='// REGISTRY_DATA_END'


def load_registry(path):
    text=Path(path).read_text(encoding='utf-8')
    match=re.search(r'// REGISTRY_DATA_START\s*const ENTRIES\s*=\s*(\[[\s\S]*?\]);\s*// REGISTRY_DATA_END',text)
    if not match: raise RuntimeError('central MEXT registry data block not found')
    return text,match,json.loads(match.group(1))


def sync(report,entries):
    by_no={str(e.get('source',{}).get('itemNo')):e for e in entries}
    source=report.get('source') or {}; sha=source.get('sha256')
    verified_at=str(report.get('generatedAt') or datetime.now(timezone.utc).isoformat())[:10]
    changes=[]; missing=[]; metadata=[]
    for row in report.get('entries') or []:
        item=str(row.get('itemNo') or '')
        target=by_no.get(item)
        if not target:
            missing.append(item); continue
        official=row.get('official')
        nutrition_changed=False
        name_changed=False
        if official:
            old=dict(target['source'].get('per100g') or {})
            new={
                'p': float(official.get('p') or 0), 'f': float(official.get('f') or 0),
                'c': float(official.get('c') or 0), 'kcal': float(official.get('kcal') or 0),
                'a': float(official.get('a') or 0)
            }
            nutrition_changed=old != new
            official_name=official.get('officialName') or target['source'].get('officialName')
            name_changed=official_name != target['source'].get('officialName')
            target['source']['officialName']=official_name
            target['source']['per100g']=new
            if nutrition_changed: changes.append({'itemNo':item,'name':target.get('name'),'old':old,'new':new})
            if name_changed: metadata.append({'itemNo':item,'name':target.get('name'),'field':'officialName'})
        snapshot_changed=bool(sha and target['source'].get('datasetSha256') != sha)
        if snapshot_changed:
            target['source']['datasetSha256']=sha
            metadata.append({'itemNo':item,'name':target.get('name'),'field':'datasetSha256'})
        if nutrition_changed or name_changed or snapshot_changed:
            target['source']['verifiedAt']=verified_at
    return changes,missing,metadata,sha,verified_at


def render(original,match,entries,sha):
    block='const ENTRIES = '+json.dumps(entries,ensure_ascii=False,indent=2)+';'
    updated=original[:match.start(0)]+START+'\n  '+block.replace('\n','\n  ')+'\n  '+END+original[match.end(0):]
    if sha:
        updated=re.sub(r"const DATASET_SHA256 = '[0-9a-f]+';",f"const DATASET_SHA256 = '{sha}';",updated,count=1)
    return updated


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--report',required=True); ap.add_argument('--registry',required=True); ap.add_argument('--write',action='store_true'); ap.add_argument('--out-json',default='mext-registry-sync.json'); args=ap.parse_args()
    report=json.loads(Path(args.report).read_text(encoding='utf-8')); original,match,entries=load_registry(args.registry)
    changes,missing,metadata,sha,verified_at=sync(report,entries)
    semantic_change=bool(changes or metadata)
    updated=render(original,match,entries,sha) if semantic_change else original
    content_changed=updated != original
    if args.write and content_changed: Path(args.registry).write_text(updated,encoding='utf-8')
    result={'schemaVersion':2,'registry':args.registry,'contentChanged':content_changed,'nutritionChanges':changes,'metadataChanges':metadata,'missingRegistryItems':missing,'datasetSha256':sha,'verifiedAt':verified_at,'entryCount':len(entries)}
    Path(args.out_json).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"MEXT_REGISTRY_SYNC changed={str(content_changed).lower()} nutrition={len(changes)} metadata={len(metadata)} missing={len(missing)} entries={len(entries)}")
    return 2 if missing else 0

if __name__=='__main__': sys.exit(main())
