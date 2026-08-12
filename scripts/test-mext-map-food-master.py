#!/usr/bin/env python3
import importlib.util
from pathlib import Path

SCRIPT=Path(__file__).with_name('mext-map-food-master.py')
spec=importlib.util.spec_from_file_location('mext_map',SCRIPT); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def item(name,category,p,f,c,kcal,aliases=None,source='legacy'):
    return {'name':name,'baseName':name,'aliases':aliases or [],'category':category,'source':{'kind':source},'per100g':{'p':p,'f':f,'c':c,'kcal':kcal,'a':0}}

def off(no,name,p,f,c,kcal): return {'itemNo':no,'officialName':name,'p':p,'f':f,'c':c,'kcal':kcal,'a':0}

rice=item('白米','staples',2.5,0.3,37.1,168,['ごはん','米'])
rows={
 '01088':off('01088','こめ 水稲めし 精白米 うるち米',2.5,0.3,37.1,156),
 '06100':off('06100','だいこん 根 皮なし 生',0.5,0.1,4.1,15),
 '01083':off('01083','こめ 水稲穀粒 精白米 うるち米',6.1,0.9,77.6,342),
}
r=m.classify_item(rice,rows)
assert r['status'] in {'high','review'}, r
assert r['candidates'][0]['itemNo'] in {'01088','01083'}
assert r['candidates'][0]['categoryCompatible'] is True
assert r['candidates'][0]['itemNo'] != '06100'

chicken=item('鶏むね(皮なし)','meat',23.3,1.9,0,105,['鶏胸肉','むね肉'])
rows2={
 '11220':off('11220','にわとり 若どり むね 皮なし 生',23.3,1.9,0,105),
 '11219':off('11219','にわとり 若どり むね 皮つき 生',21.3,5.9,0,133),
 '10003':off('10003','まあじ 皮つき 生',19.7,4.5,0.1,112),
}
r2=m.classify_item(chicken,rows2)
assert r2['status']=='high',r2
assert r2['candidates'][0]['itemNo']=='11220',r2
assert r2['nutritionInParity'] is True

supp=item('ホエイプロテイン','supplements',80,7,8,410,['プロテイン'])
r3=m.classify_item(supp,rows2)
assert r3['status'] in {'mext-unlikely','unmapped'} and not r3['autoPromotable']

already=item('マンゴー(生)','fruit',0.6,0.1,16.9,68,source='mext')
r4=m.classify_item(already,rows2)
assert r4['status']=='already-mext'

print('MEXT Food Master mapping tests passed.')
