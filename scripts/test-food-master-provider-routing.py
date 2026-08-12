#!/usr/bin/env python3
import importlib.util
from pathlib import Path

SCRIPT=Path(__file__).with_name('route-food-master-providers.py')
spec=importlib.util.spec_from_file_location('router',SCRIPT); r=importlib.util.module_from_spec(spec); spec.loader.exec_module(r)

def item(name,cat,source='legacy',unit='g',per=True):
 return {'name':name,'category':cat,'source':{'kind':source},'nutritionBasis':{'unit':unit},'input':{'defaultUnit':unit},'per100g':({'p':1,'f':1,'c':1,'kcal':20} if per else None),'confidence':'legacy'}

assert r.route(item('白米','staples','mext'))[0]=='mext'
assert r.route(item('ザバスプロテイン','convenience',unit='本',per=False))[0]=='manufacturer'
assert r.route(item('ビッグマック','fast-food',unit='個',per=False))[0]=='restaurant'
assert r.route(item('味噌汁(豆腐わかめ)','soup',unit='杯',per=False))[0]=='recipe-estimate'
assert r.route(item('バナナ','fruit',unit='本',per=False))[2]=='needs-unit'
assert r.route(item('鶏むね(皮なし)','meat',unit='g',per=True))[0]=='mext'
assert r.route(item('コーラ','beverages',unit='ml',per=False))[2]=='needs-unit'
assert r.route(item('じゃがりこ','snacks-sweets',unit='カップ',per=False))[0]=='manufacturer'
print('Food Master provider routing tests passed.')
