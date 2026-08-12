#!/usr/bin/env python3
import argparse,json,re
from pathlib import Path

DATASET='0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c'
VERIFIED_AT='2026-08-12'
BATCH=[
 {'name':'玄米','itemNo':'01085','officialName':'こめ　［水稲めし］　玄米','p':2.8,'f':1.0,'c':35.6,'kcal':152.0,'a':0.0},
 {'name':'木綿豆腐','itemNo':'04032','officialName':'だいず　［豆腐・油揚げ類］　木綿豆腐','p':7.0,'f':4.9,'c':1.5,'kcal':73.0,'a':0.0},
 {'name':'絹ごし豆腐','itemNo':'04033','officialName':'だいず　［豆腐・油揚げ類］　絹ごし豆腐','p':5.3,'f':3.5,'c':2.0,'kcal':56.0,'a':0.0},
 {'name':'ヨーグルト','itemNo':'13025','officialName':'＜牛乳及び乳製品＞　（発酵乳・乳酸菌飲料）　ヨーグルト　全脂無糖','p':3.6,'f':3.0,'c':4.9,'kcal':56.0,'a':0.0},
 {'name':'ブリ','itemNo':'10241','officialName':'＜魚類＞　ぶり　成魚　生','p':21.4,'f':17.6,'c':0.3,'kcal':222.0,'a':0.0},
 {'name':'はちみつ','itemNo':'03022','officialName':'（その他）　はちみつ','p':0.3,'f':0.0,'c':81.9,'kcal':329.0,'a':0.0},
]

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--registry',required=True); ap.add_argument('--write',action='store_true'); ap.add_argument('--out-json',default='mext-batch2-bootstrap.json'); args=ap.parse_args()
 p=Path(args.registry); text=p.read_text(encoding='utf-8')
 m=re.search(r'(// REGISTRY_DATA_START\s*const ENTRIES\s*=\s*)(\[[\s\S]*?\])(;\s*// REGISTRY_DATA_END)',text)
 if not m: raise RuntimeError('registry data block not found')
 entries=json.loads(m.group(2)); by_name={e.get('name'):e for e in entries}; by_no={e.get('source',{}).get('itemNo'):e for e in entries}
 added=[]; skipped=[]
 for row in BATCH:
  if row['name'] in by_name or row['itemNo'] in by_no:
   skipped.append({'name':row['name'],'itemNo':row['itemNo'],'reason':'already-present'}); continue
  entries.append({'name':row['name'],'source':{'kind':'mext','label':'文部科学省 日本食品標準成分表','itemNo':row['itemNo'],'officialName':row['officialName'],'datasetSha256':DATASET,'verifiedAt':VERIFIED_AT,'per100g':{k:row[k] for k in ('p','f','c','kcal','a')}},'canonicalId':'mext:'+row['itemNo']})
  added.append({'name':row['name'],'itemNo':row['itemNo']})
 block=json.dumps(entries,ensure_ascii=False,indent=2)
 updated=text[:m.start()]+m.group(1)+block+m.group(3)+text[m.end():]
 if args.write and updated!=text: p.write_text(updated,encoding='utf-8')
 result={'schemaVersion':1,'before':len(entries)-len(added),'after':len(entries),'added':added,'skipped':skipped,'contentChanged':updated!=text}
 Path(args.out_json).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f"MEXT_BATCH2 before={result['before']} added={len(added)} after={result['after']}")
 if result['after'] != 46: raise SystemExit(f"expected 46 registry entries, got {result['after']}")
if __name__=='__main__': main()
