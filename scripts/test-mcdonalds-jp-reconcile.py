#!/usr/bin/env python3
import importlib.util
from pathlib import Path

SCRIPT=Path(__file__).with_name('mcdonalds-jp-reconcile.py')
spec=importlib.util.spec_from_file_location('mcd',SCRIPT); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

html='''<table><tr><th>Product Name</th><th>Energy (kcal)</th><th>Protein (g)</th><th>Fat (g)</th><th>Carbohydrate (g)</th></tr>
<tr><td>Big Mac®</td><td>524</td><td>26.1</td><td>28.0</td><td>42.0</td></tr>
<tr><td>Chicken Cheese (McChicken® Cheese)</td><td>436</td><td>16.4</td><td>23.6</td><td>40.3</td></tr></table>'''
p=m.TableParser(); p.feed(html)
entries=[
 {'name':'ビッグマック','canonicalId':'restaurant:mcd-jp:big-mac','providerKey':'Big Mac','sourceMode':'nutrition-list'},
 {'name':'チキチー','canonicalId':'restaurant:mcd-jp:chikichee','providerKey':'Chicken Cheese','sourceMode':'nutrition-list'}
]
found=m.parse_burger_list(p,entries)
assert found['restaurant:mcd-jp:big-mac']['nutrition']=={'p':26.1,'f':28.0,'c':42.0,'kcal':524.0,'a':0.0}
assert found['restaurant:mcd-jp:chikichee']['nutrition']['kcal']==436.0

side='''<a href="/products/2010/">マックフライポテト®</a><a href="/products/1900/">チキンマックナゲット® 5ピース</a>'''
sp=m.TableParser(); sp.feed(side)
assert m.discover_side_link(sp,'fries').endswith('/products/2010/')
assert m.discover_side_link(sp,'nuggets').endswith('/products/1900/')
assert m.with_size('https://www.mcdonalds.co.jp/products/2010/','S').endswith('/products/2010/?size=2')
assert m.with_size('https://www.mcdonalds.co.jp/products/2010/?foo=1','L').endswith('/products/2010/?foo=1&size=3')

product='''<table><tr><td>エネルギー (kcal)</td><td>404</td></tr><tr><td>たんぱく質 (g)</td><td>5.3</td></tr><tr><td>脂質 (g)</td><td>19.7</td></tr><tr><td>炭水化物 (g)</td><td>51.8</td></tr></table>'''
pp=m.TableParser(); pp.feed(product)
assert m.row_value(pp,['エネルギー','energy'])==404.0
assert m.row_value(pp,['たんぱく質','protein'])==5.3

entry={'officialName':'Big Mac®','sourceUrl':m.LIST_URL,'nutrition':{'p':26.1,'f':28.0,'c':42.0,'kcal':524,'a':0}}
off={'officialName':'Big Mac®','sourceUrl':m.LIST_URL,'nutrition':{'p':26.1,'f':28.0,'c':42.0,'kcal':524,'a':0}}
assert m.diff(entry,off)==[]
off['nutrition']['kcal']=525
assert m.diff(entry,off)==['kcal']
print("McDonald's Japan reconciliation parser tests passed.")
