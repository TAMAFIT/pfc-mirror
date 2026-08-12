#!/usr/bin/env python3
import argparse
import importlib.util
import json
import re
from pathlib import Path

CORE=Path(__file__).with_name('mext-reconcile.py')
spec=importlib.util.spec_from_file_location('mext_reconcile_core',CORE)
core=importlib.util.module_from_spec(spec); spec.loader.exec_module(core)


def patch_entry(text,name,item_no):
    marker=json.dumps(name,ensure_ascii=False)
    start=text.find(f'"name": {marker}')
    if start < 0: return text,False,None
    nxt=text.find('\n  },\n  {',start)
    if nxt < 0: nxt=text.find('\n];',start)
    if nxt < 0: raise RuntimeError(f'could not isolate registry entry: {name}')
    block=text[start:nxt]
    m=re.search(r'"itemNo":\s*"(\d{5})"',block)
    if not m: raise RuntimeError(f'itemNo missing in registry entry: {name}')
    old=m.group(1)
    if old==item_no: return text,False,old
    block=block[:m.start(1)]+item_no+block[m.end(1):]
    c=re.search(r'"canonicalId":\s*"mext:(\d{5})"',block)
    if not c: raise RuntimeError(f'canonicalId missing in registry entry: {name}')
    block=block[:c.start(1)]+item_no+block[c.end(1):]
    return text[:start]+block+text[nxt:],True,old


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--registry',required=True); ap.add_argument('--legacy',action='append',default=[]); ap.add_argument('--write',action='store_true'); ap.add_argument('--out-json',default='mext-registry-bootstrap.json'); args=ap.parse_args()
    path=Path(args.registry); text=path.read_text(encoding='utf-8'); original=text
    trusted={entry['name']:entry['itemNo'] for entry in core.verified(args.legacy)}
    changes=[]
    for name,item_no in trusted.items():
        text,changed,old=patch_entry(text,name,item_no)
        if changed: changes.append({'name':name,'from':old,'to':item_no})
    if args.write and text!=original: path.write_text(text,encoding='utf-8')
    result={'schemaVersion':1,'trustedEntries':len(trusted),'changes':changes,'contentChanged':text!=original}
    Path(args.out_json).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"MEXT_REGISTRY_BOOTSTRAP trusted={len(trusted)} changed={len(changes)}")

if __name__=='__main__': main()
