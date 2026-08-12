#!/usr/bin/env python3
import argparse
import json
from collections import Counter
from pathlib import Path

STATE_WORDS=('生','ゆで','焼き','焼','蒸し','水煮','油漬','乾','皮なし','皮つき','皮あり','冷凍','缶詰','無糖','加糖')


def reason(item):
    m=item.get('mapping') or {}; status=m.get('status'); candidates=m.get('candidates') or []
    if status=='already-mext': return 'already-official'
    if status in {'mext-unlikely','external-source'}: return 'external-or-mext-unlikely'
    if not candidates: return 'no-candidate'
    top=candidates[0]; margin=float(m.get('margin') or 0); per=item.get('per100g')
    if per is None: return 'non-mass-or-non-normalizable'
    official=str(top.get('officialName') or '')
    app=str(item.get('name') or '')
    app_states=[s for s in STATE_WORDS if s in app]
    if not app_states and any(s in official for s in ('ゆで','焼き','蒸し','水煮','油漬','乾','冷凍','缶詰')):
        return 'state-ambiguous'
    if margin < 6:
        return 'identity-ambiguous'
    sim=top.get('nutritionSimilarity')
    changed=m.get('syncNeededFields') or []
    if status=='high' and changed:
        return 'nutrition-drift'
    if sim is not None and sim < 0.72:
        return 'nutrition-or-identity-drift'
    if top.get('nameScore',0) < 70:
        return 'weak-name-match'
    return 'manual-semantic-review'


def priority(item, why):
    m=item.get('mapping') or {}; c=(m.get('candidates') or [{}])[0]
    base=float(c.get('score') or 0)+float(m.get('margin') or 0)*0.4
    bonus={'nutrition-drift':25,'manual-semantic-review':18,'identity-ambiguous':4,'state-ambiguous':0,'nutrition-or-identity-drift':-8,'weak-name-match':-12,'non-mass-or-non-normalizable':-20,'no-candidate':-30,'external-or-mext-unlikely':-40,'already-official':-100}.get(why,0)
    return round(base+bonus,2)


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--map',required=True); ap.add_argument('--out-json',default='mext-review-triage.json'); ap.add_argument('--out-md',default='mext-review-triage.md'); args=ap.parse_args()
    report=json.loads(Path(args.map).read_text(encoding='utf-8')); rows=[]
    for item in report.get('items',[]):
        why=reason(item); m=item.get('mapping') or {}; top=(m.get('candidates') or [None])[0]
        rows.append({'name':item.get('name'),'category':item.get('category'),'reason':why,'priority':priority(item,why),'per100g':item.get('per100g'),'status':m.get('status'),'margin':m.get('margin'),'candidate':top})
    rows.sort(key=lambda x:(-x['priority'],x['name'] or ''))
    counts=Counter(x['reason'] for x in rows)
    out={'schemaVersion':1,'canonicalRows':report.get('canonicalRows'),'counts':dict(sorted(counts.items())),'queue':rows}
    Path(args.out_json).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines=['# MEXT review queue triage','',f"- Canonical foods: `{report.get('canonicalRows')}`"]
    for k,v in sorted(counts.items()): lines.append(f'- {k}: `{v}`')
    lines += ['','## Highest-priority unresolved foods','', '| Food | Reason | Best candidate | Score | Margin |','|---|---|---|---:|---:|']
    for x in [r for r in rows if r['reason'] not in {'already-official','external-or-mext-unlikely'}][:80]:
        c=x['candidate'] or {}; lines.append(f"| {x['name']} | {x['reason']} | {c.get('itemNo','')} {c.get('officialName','')} | {c.get('score','')} | {x.get('margin','')} |")
    Path(args.out_md).write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('MEXT_TRIAGE '+json.dumps(dict(counts),ensure_ascii=False,sort_keys=True))

if __name__=='__main__': main()
