#!/usr/bin/env python3
import argparse
import importlib.util
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

HELPER = Path(__file__).with_name('mext-reconcile-identifiers.py')
spec = importlib.util.spec_from_file_location('mext_reconcile_identifiers', HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
core = helper.core

CATEGORY_GROUPS = {
    'staples': {'01','02'}, 'meat': {'11'}, 'seafood': {'10'},
    'eggs-dairy-soy': {'04','12','13'}, 'vegetables': {'06','08','09'}, 'fruit': {'07'},
    'fats-condiments': {'03','14','17'}, 'beverages': {'16'}, 'alcohol': {'16'},
    'soup': {'17','18'}, 'dishes': {'18'}, 'snacks-sweets': {'15','18'}
}
MEXT_UNLIKELY = {'supplements','convenience','fast-food'}
GENERIC = {'肉','にく','魚','さかな','米','こめ','ごはん','麺','めん','パン','ぱん','野菜','やさい','果物','くだもの','フルーツ','飲み物','コンビニ','お菓子','スイーツ'}
STATE_CUES = ['皮なし','皮つき','皮あり','生','ゆで','焼き','焼','蒸し','水煮','油漬','乾','めし','精白','全粒','無糖','加糖']


def norm(value):
    s = unicodedata.normalize('NFKC', str(value or '')).lower()
    out=[]
    for ch in s:
        code=ord(ch)
        if 0x30A1 <= code <= 0x30F6: ch=chr(code-0x60)
        out.append(ch)
    return re.sub(r'[\s\u3000・･()（）\[\]［］{}「」『』<>＜＞\-_/,:：;；.。]+','',''.join(out))


def bigrams(s):
    return {s[i:i+2] for i in range(len(s)-1)} if len(s)>=2 else ({s} if s else set())


def dice(a,b):
    aa,bb=bigrams(a),bigrams(b)
    return 0.0 if not aa or not bb else 2*len(aa & bb)/(len(aa)+len(bb))


def name_variants(item):
    generic={norm(x) for x in GENERIC}; out=[]
    for value in [item.get('name'),item.get('baseName'),*(item.get('aliases') or [])]:
        n=norm(value)
        if len(n)>=2 and n not in generic and n not in out: out.append(n)
    return out


def name_score(item, official_name):
    off=norm(official_name)
    if not off: return 0.0,'none'
    best=(0.0,'none')
    for s in name_variants(item):
        if s==off: cand=(100.0,'exact')
        elif min(len(s),len(off))>=2 and (s in off or off in s):
            cand=(78+12*min(len(s),len(off))/max(len(s),len(off)),'contains')
        else: cand=(70*dice(s,off),'bigrams')
        if cand[0]>best[0]: best=cand
    app=norm(item.get('name'))
    for cue in STATE_CUES:
        q=norm(cue)
        if q and q in app:
            if q in off: best=(best[0]+6,best[1]+'+state')
            elif cue!='焼': best=(best[0]-10,best[1]+'-state')
    return max(0.0,min(112.0,best[0])),best[1]


def category_score(item,item_no):
    allowed=CATEGORY_GROUPS.get(item.get('category') or 'other')
    if not allowed: return 0.0,None
    return (20.0,True) if str(item_no)[:2] in allowed else (-28.0,False)


def component_similarity(a,b,relative=0.18,floor=0.6):
    if a is None or b is None: return None
    tol=max(floor,relative*max(abs(float(b)),2.0))
    return max(0.0,1.0-abs(float(a)-float(b))/tol)


def nutrition_similarity(item,official):
    current=item.get('per100g')
    if not current: return None
    parts=[]
    for k in ('p','f','c'):
        s=component_similarity(current.get(k),official.get(k),0.20,0.7)
        if s is not None: parts.append((s,1.0))
    s=component_similarity(current.get('kcal'),official.get('kcal'),0.10,6.0)
    if s is not None: parts.append((s,1.5))
    return None if not parts else sum(s*w for s,w in parts)/sum(w for _,w in parts)


def parity(item,official):
    current=item.get('per100g')
    if not current: return False,[]
    changed=[]
    for k in ('p','f','c'):
        a,b=current.get(k),official.get(k)
        if b is None or a is None or abs(float(a)-float(b))>0.11: changed.append(k)
    a,b=current.get('kcal'),official.get('kcal')
    if b is None or a is None or abs(float(a)-float(b))>1.0: changed.append('kcal')
    return not changed,changed


def score_candidate(item,official):
    ns,reason=name_score(item,official.get('officialName')); cs,cat_ok=category_score(item,official.get('itemNo')); sim=nutrition_similarity(item,official)
    nutr=0.0 if sim is None else 72*sim
    if sim is not None and sim<0.35: nutr-=18
    return {'itemNo':official.get('itemNo'),'officialName':official.get('officialName'),'score':round(ns+cs+nutr,2),'nameScore':round(ns,2),'nameReason':reason,'categoryCompatible':cat_ok,'nutritionSimilarity':None if sim is None else round(sim,4),'official':{k:official.get(k) for k in ('p','f','c','kcal','a')}}


def classify_item(item,rows):
    source_kind=(item.get('source') or {}).get('kind')
    if source_kind=='mext': return {'status':'already-mext','autoPromotable':False,'candidates':[]}
    if source_kind in {'manufacturer','restaurant'}: return {'status':'external-source','autoPromotable':False,'candidates':[]}
    unlikely=item.get('category') in MEXT_UNLIKELY
    scored=sorted((score_candidate(item,row) for row in rows.values()),key=lambda x:x['score'],reverse=True)[:3]
    if not scored: return {'status':'unmapped','autoPromotable':False,'candidates':[]}
    top=scored[0]; second=scored[1] if len(scored)>1 else {'score':-999}; margin=top['score']-second['score']
    has_mass=item.get('per100g') is not None; sim=top.get('nutritionSimilarity'); cat_ok=top.get('categoryCompatible')
    high=(not unlikely and has_mass and cat_ok is True and top['nameScore']>=62 and sim is not None and sim>=0.78 and top['score']>=132 and margin>=10)
    if top['nameReason'].startswith('exact') and not unlikely and has_mass and cat_ok is True and sim is not None and sim>=0.68 and top['score']>=128 and margin>=4: high=True
    # MEXT taxonomy often says にわとり/若どり while the app says 鶏. Permit this only
    # when nutrition is essentially exact, state wording agrees, and the runner-up is far behind.
    if not unlikely and has_mass and cat_ok is True and sim is not None and sim>=0.98 and top['nameScore']>=32 and '+state' in top['nameReason'] and top['score']>=125 and margin>=30: high=True
    review=(top['score']>=92 and top['nameScore']>=38 and cat_ok is not False)
    status='high' if high else ('review' if review else ('mext-unlikely' if unlikely else 'unmapped'))
    synced,changed=parity(item,top['official']) if high else (False,[])
    return {'status':status,'autoPromotable':bool(high),'nutritionInParity':bool(synced),'syncNeededFields':changed,'margin':round(margin,2),'candidates':scored}


def markdown(report):
    c=report['counts']; lines=['# MEXT Food Master auto-mapping','',f"- Canonical foods: `{report['canonicalRows']}`",f"- Already MEXT-backed: `{c.get('already-mext',0)}`",f"- High-confidence new mappings: `{c.get('high',0)}`",f"- Review candidates: `{c.get('review',0)}`",f"- MEXT-unlikely / external: `{c.get('mext-unlikely',0)+c.get('external-source',0)}`",f"- Unmapped: `{c.get('unmapped',0)}`",f"- Official workbook: `{report['source']['workbookUrl']}`",f"- Workbook SHA-256: `{report['source']['sha256']}`",'']
    high=[x for x in report['items'] if x['mapping']['status']=='high']
    if high:
        lines += ['## High-confidence promotion candidates','', '| PFC food | MEXT item | Official name | Score | Margin | Nutrition |','|---|---:|---|---:|---:|---|']
        for x in high[:120]:
            mm=x['mapping']; t=mm['candidates'][0]; p='same' if mm['nutritionInParity'] else 'sync '+','.join(mm['syncNeededFields'])
            lines.append(f"| {x['name']} | {t['itemNo']} | {t['officialName']} | {t['score']} | {mm['margin']} | {p} |")
    review=[x for x in report['items'] if x['mapping']['status']=='review']
    if review:
        lines += ['','## Review queue (top 60)','', '| PFC food | Best MEXT candidate | Score | Margin |','|---|---|---:|---:|']
        for x in review[:60]:
            mm=x['mapping']; t=mm['candidates'][0]; lines.append(f"| {x['name']} | {t['itemNo']} {t['officialName']} | {t['score']} | {mm['margin']} |")
    return '\n'.join(lines)+'\n'


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--food-master',default='food-master-effective.json'); ap.add_argument('--out-json',default='mext-food-master-map.json'); ap.add_argument('--out-md',default='mext-food-master-map.md'); args=ap.parse_args()
    master=json.loads(Path(args.food_master).read_text(encoding='utf-8')); url,label=core.discover_workbook(); body,ctype=core.fetch_bytes(url)
    if not body.startswith(b'PK'): raise RuntimeError(f'MEXT workbook is not XLSX: {ctype}')
    tmp=Path('.mext-food-master-map.xlsx'); tmp.write_bytes(body)
    try:
        import hashlib
        sha=hashlib.sha256(body).hexdigest(); rows,sheet,cols=core.load_rows(tmp)
    finally: tmp.unlink(missing_ok=True)
    mapped=[]; counts={}
    for item in master['items']:
        mm=classify_item(item,rows); counts[mm['status']]=counts.get(mm['status'],0)+1
        mapped.append({'name':item['name'],'runtimeIndex':item['runtimeIndex'],'legacyIndex':item.get('legacyIndex'),'category':item.get('category'),'source':item.get('source'),'per100g':item.get('per100g'),'mapping':mm})
    report={'schemaVersion':1,'generatedAt':datetime.now(timezone.utc).isoformat(),'canonicalRows':master['canonicalRows'],'counts':counts,'source':{'workbookUrl':url,'linkText':label,'sha256':sha,'sheet':sheet,'officialFoodRows':len(rows)},'items':mapped}
    Path(args.out_json).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); Path(args.out_md).write_text(markdown(report),encoding='utf-8')
    print('MEXT_MAP '+json.dumps(counts,ensure_ascii=False,sort_keys=True)); return 0

if __name__=='__main__': sys.exit(main())
