#!/usr/bin/env python3
import argparse
import json
import re
from collections import Counter
from pathlib import Path

GENERAL_CATEGORIES={'staples','meat','seafood','vegetables','fruit','eggs-dairy-soy','fats-condiments'}
BIOLOGICAL_CATEGORIES={'meat','seafood','vegetables','fruit','eggs-dairy-soy'}
RECIPE_CATEGORIES={'dishes','soup'}
COMMERCIAL_CATEGORIES={'convenience','supplements'}
RESTAURANT_NAMES={
 'ハンバーガー','チーズバーガー','てりやきバーガー','ビッグマック','月見バーガー','ポテト(S)','ポテト(M)','ポテト(L)','ナゲット(5個)','マックシェイク',
 'モスバーガー','ケンタッキー','クリスピーチキン','ツイスター','ダブルチーズ','フィレオフィッシュ','エグチ','チキチー','グラコロ','アップルパイ','スタバ(フラペ)'
}
BRAND_MARKERS=('ザバス','森永','ベースブレッド','オイコス','フルグラ','じゃがりこ','ジャガビー','カラムーチョ','チップスター','ブラックサンダー','アルフォート','たけのこの里','きのこの山','ポッキー','トッポ','GABA','特茶','黒烏龍','ポカリ','アクエリ','アーモンド効果','ストロング系')
PACKAGE_WORDS=('缶','パック','バー','一本','一袋','小袋','カップ','ペット','350','500','6P')
PIECE_UNITS={'個','本','枚','切','粒','玉','尾','杯','皿','食','パック','袋','箱','カップ','缶','P'}


def commercial_name(name):
    return any(x in name for x in BRAND_MARKERS) or any(x in name for x in PACKAGE_WORDS)


def route(item):
    name=str(item.get('name') or '')
    category=item.get('category') or 'other'
    source=(item.get('source') or {}).get('kind') or 'legacy'
    basis=item.get('nutritionBasis') or {}
    input_data=item.get('input') or {}
    unit=input_data.get('defaultUnit') or basis.get('unit')
    per100=item.get('per100g')

    if source=='mext':
        return 'mext','current-basis-or-curated-serving','verified','official-mext'
    if source=='manufacturer':
        return 'manufacturer','package-label','verified','official-manufacturer'
    if source=='restaurant':
        return 'restaurant','menu-serving','verified','official-restaurant'

    if name in RESTAURANT_NAMES or category=='fast-food':
        return 'restaurant','menu-serving','needs-source','chain-menu-official'
    if category in COMMERCIAL_CATEGORIES or commercial_name(name):
        return 'manufacturer','package-label','needs-source','commercial-product-label'
    if category in RECIPE_CATEGORIES:
        return 'recipe-estimate','recipe-serving','estimated','generic-composite-dish'
    if category=='alcohol':
        return 'manufacturer-or-recipe','package-or-pour','needs-source','product-and-pour-vary'
    if category=='beverages':
        if commercial_name(name):
            return 'manufacturer','package-label','needs-source','commercial-beverage'
        return 'mext-or-manufacturer','volume-conversion-or-label','needs-unit','liquid-volume-basis'
    if category=='snacks-sweets':
        if commercial_name(name):
            return 'manufacturer','package-label','needs-source','commercial-snack'
        return 'mext-or-recipe','serving-or-piece','needs-unit','generic-snack-or-dessert'

    if category in GENERAL_CATEGORIES:
        if per100 is not None:
            return 'mext','mass','needs-source','mass-normalizable-general-food'
        if unit in PIECE_UNITS or category in BIOLOGICAL_CATEGORIES:
            return 'mext','official-standard-or-serving-estimate','needs-unit','general-food-piece-or-volume'
        return 'mext','mass-conversion','needs-unit','general-food-nonmass-basis'

    return 'manual-review','unknown','review','unclassified'


def priority(provider,status,reason):
    base={'needs-source':80,'needs-unit':65,'review':45,'estimated':30,'verified':0}.get(status,40)
    if provider in {'manufacturer','restaurant'}: base+=15
    if reason=='mass-normalizable-general-food': base+=20
    if reason in {'commercial-product-label','chain-menu-official'}: base+=10
    return base


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--food-master',required=True); ap.add_argument('--policy',required=True); ap.add_argument('--out-json',default='food-master-provider-routing.json'); ap.add_argument('--out-md',default='food-master-provider-routing.md'); args=ap.parse_args()
    master=json.loads(Path(args.food_master).read_text(encoding='utf-8')); policy=json.loads(Path(args.policy).read_text(encoding='utf-8'))
    rows=[]
    for item in master.get('items',[]):
        provider,unit_provider,status,why=route(item)
        rows.append({
            'name':item.get('name'),'category':item.get('category'),'currentSource':(item.get('source') or {}).get('kind'),'currentConfidence':item.get('confidence'),
            'nutritionProvider':provider,'unitProvider':unit_provider,'status':status,'reason':why,'defaultUnit':(item.get('input') or {}).get('defaultUnit'),'hasPer100g':item.get('per100g') is not None,
            'priority':priority(provider,status,why)
        })
    rows.sort(key=lambda x:(-x['priority'],x['category'] or '',x['name'] or ''))
    provider_counts=Counter(x['nutritionProvider'] for x in rows); status_counts=Counter(x['status'] for x in rows); reason_counts=Counter(x['reason'] for x in rows)
    report={
        'schemaVersion':1,'policyVersion':policy.get('policyVersion'),'canonicalRows':master.get('canonicalRows'),'providerCounts':dict(provider_counts),'statusCounts':dict(status_counts),'reasonCounts':dict(reason_counts),'queue':rows
    }
    Path(args.out_json).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines=['# Food Master authoritative provider routing','',f"- Policy: `{policy.get('policyVersion')}`",f"- Canonical foods: `{master.get('canonicalRows')}`",'', '## Status']
    for k,v in sorted(status_counts.items()): lines.append(f'- {k}: `{v}`')
    lines += ['','## Nutrition provider']
    for k,v in sorted(provider_counts.items()): lines.append(f'- {k}: `{v}`')
    lines += ['','## Highest-priority source queue','', '| Food | Category | Provider | Unit authority | Reason |','|---|---|---|---|---|']
    for x in [r for r in rows if r['status'] not in {'verified','estimated'}][:100]:
        lines.append(f"| {x['name']} | {x['category']} | {x['nutritionProvider']} | {x['unitProvider']} | {x['reason']} |")
    Path(args.out_md).write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('FOOD_MASTER_PROVIDER_ROUTING '+json.dumps({'providers':dict(provider_counts),'statuses':dict(status_counts)},ensure_ascii=False,sort_keys=True))

if __name__=='__main__': main()
