#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path

START='// RESTAURANT_DATA_START'
END='// RESTAURANT_DATA_END'

def load_registry(path):
    text=Path(path).read_text(encoding='utf-8')
    m=re.search(r'// RESTAURANT_DATA_START\s*const ENTRIES\s*=\s*(\[[\s\S]*?\]);\s*// RESTAURANT_DATA_END',text)
    if not m: raise RuntimeError('restaurant registry data block not found')
    return text,m,json.loads(m.group(1))

def sync(report,entries):
    by_id={e.get('canonicalId'):e for e in entries}; changes=[]; missing=[]
    verified_at=str(report.get('generatedAt') or '')[:10]
    for row in report.get('entries') or []:
        cid=row.get('canonicalId'); target=by_id.get(cid); off=row.get('official')
        if not target:
            missing.append(cid); continue
        if not off: continue
        fields=[]
        if target.get('nutrition') != off.get('nutrition'):
            old=dict(target.get('nutrition') or {}); target['nutrition']=dict(off.get('nutrition') or {})
            fields.append({'field':'nutrition','old':old,'new':target['nutrition']})
        if target.get('officialName') != off.get('officialName'):
            fields.append({'field':'officialName','old':target.get('officialName'),'new':off.get('officialName')}); target['officialName']=off.get('officialName')
        if target.get('sourceUrl') != off.get('sourceUrl'):
            fields.append({'field':'sourceUrl','old':target.get('sourceUrl'),'new':off.get('sourceUrl')}); target['sourceUrl']=off.get('sourceUrl')
        if fields: changes.append({'canonicalId':cid,'name':target.get('name'),'fields':fields})
    return changes,missing,verified_at

def render(original,m,entries,verified_at):
    block='const ENTRIES = '+json.dumps(entries,ensure_ascii=False,indent=2)+';'
    updated=original[:m.start(0)]+START+'\n  '+block.replace('\n','\n  ')+'\n  '+END+original[m.end(0):]
    if verified_at:
        updated=re.sub(r"const VERIFIED_AT = '[^']*';",f"const VERIFIED_AT = '{verified_at}';",updated,count=1)
    return updated

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--report',required=True); ap.add_argument('--registry',required=True); ap.add_argument('--write',action='store_true'); ap.add_argument('--out-json',default='mcd-jp-sync.json'); args=ap.parse_args()
    report=json.loads(Path(args.report).read_text(encoding='utf-8')); original,m,entries=load_registry(args.registry)
    changes,missing,verified_at=sync(report,entries)
    updated=render(original,m,entries,verified_at) if changes else original
    changed=updated!=original
    if args.write and changed: Path(args.registry).write_text(updated,encoding='utf-8')
    out={'schemaVersion':1,'contentChanged':changed,'changes':changes,'missingRegistryItems':missing,'verifiedAt':verified_at,'sourceSnapshotSha256':report.get('sourceSnapshotSha256'),'entryCount':len(entries)}
    Path(args.out_json).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"MCD_JP_SYNC changed={str(changed).lower()} changes={len(changes)} missing={len(missing)} entries={len(entries)}")
    return 2 if missing else 0

if __name__=='__main__': sys.exit(main())
