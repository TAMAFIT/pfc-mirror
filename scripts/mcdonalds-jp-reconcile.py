#!/usr/bin/env python3
import argparse
import hashlib
import html.parser
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA='TAMAFIT-PFC-FoodMaster-Restaurant-Reconciler/1.0 (+https://github.com/TAMAFIT/pfc-mirror)'
LIST_URL='https://www.mcdonalds.co.jp/en/quality/allergy_Nutrition/nutrient/'
SIDE_URL='https://www.mcdonalds.co.jp/en/menu/side/'

class TableParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None; self.links=[]; self.link=None; self.all_text=[]
    def handle_starttag(self,tag,attrs):
        t=tag.lower(); d=dict(attrs)
        if t=='tr': self.row=[]
        elif t in ('td','th') and self.row is not None: self.cell=[]
        elif t=='a': self.link={'href':d.get('href',''),'text':[]}
    def handle_data(self,data):
        self.all_text.append(data)
        if self.cell is not None: self.cell.append(data)
        if self.link is not None: self.link['text'].append(data)
    def handle_endtag(self,tag):
        t=tag.lower()
        if t in ('td','th') and self.cell is not None:
            self.row.append(clean_text(' '.join(self.cell))); self.cell=None
        elif t=='tr' and self.row is not None:
            if any(self.row): self.rows.append(self.row)
            self.row=None; self.cell=None
        elif t=='a' and self.link is not None:
            self.links.append((self.link['href'],clean_text(' '.join(self.link['text'])))); self.link=None

def clean_text(value):
    return re.sub(r'\s+',' ',str(value or '')).strip()

def norm(value):
    s=unicodedata.normalize('NFKC',str(value or '')).lower().replace('®','').replace('™','')
    out=[]
    for ch in s:
        code=ord(ch)
        if 0x30A1<=code<=0x30F6: ch=chr(code-0x60)
        out.append(ch)
    return re.sub(r'[^0-9a-zぁ-ん一-龯々]+','',''.join(out))

def number(value):
    m=re.search(r'-?\d+(?:\.\d+)?',str(value or '').replace(',',''))
    return float(m.group(0)) if m else None

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept-Language':'ja,en;q=0.8'})
    with urllib.request.urlopen(req,timeout=45) as r:
        body=r.read(); ctype=r.headers.get('Content-Type','')
    text=body.decode('utf-8','replace')
    p=TableParser(); p.feed(text)
    return text,p,ctype

def parse_registry(path):
    text=Path(path).read_text(encoding='utf-8')
    m=re.search(r'// RESTAURANT_DATA_START\s*const ENTRIES\s*=\s*(\[[\s\S]*?\]);\s*// RESTAURANT_DATA_END',text)
    if not m: raise RuntimeError('restaurant registry data block not found')
    return json.loads(m.group(1))

def header_index(header, needles):
    normalized=[norm(x) for x in needles if norm(x)]
    for i,cell in enumerate(header):
        key=norm(cell)
        if any(n == key or n in key for n in normalized): return i
    return None

def nutrition_columns(parser):
    for row in parser.rows:
        keys=[norm(x) for x in row]
        if not any('productname' in x or x=='商品名' for x in keys): continue
        cols={
            'name': header_index(row,['Product Name','商品名']),
            'kcal': header_index(row,['Calories','Energy','エネルギー']),
            'p': header_index(row,['Protein','たんぱく質']),
            'f': header_index(row,['Fat','脂質']),
            'c': header_index(row,['Carbohydrate','炭水化物'])
        }
        if all(v is not None for v in cols.values()): return cols
    return None

def parse_burger_list(parser,entries):
    cols=nutrition_columns(parser)
    if not cols: return {}
    max_col=max(cols.values())
    rows=[]
    for row in parser.rows:
        if len(row)<=max_col: continue
        vals={k:number(row[i]) for k,i in cols.items() if k!='name'}
        if any(v is None for v in vals.values()): continue
        rows.append((norm(row[cols['name']]),row,vals))
    found={}
    for entry in entries:
        if entry.get('sourceMode')!='nutrition-list': continue
        target=norm(entry.get('providerKey'))
        exact=[x for x in rows if x[0]==target]
        prefix=[x for x in rows if x[0].startswith(target)] if not exact else []
        matches=exact or prefix
        if len(matches)!=1: continue
        _,row,vals=matches[0]
        found[entry['canonicalId']]={
            'canonicalId':entry['canonicalId'],'name':entry['name'],'officialName':row[cols['name']],
            'sourceUrl':LIST_URL,'nutrition':{'p':vals['p'],'f':vals['f'],'c':vals['c'],'kcal':vals['kcal'],'a':0.0}
        }
    return found

def discover_side_link(parser,kind):
    terms={
        'fries':['マックフライポテト','mcfrypotato','frenchfries'],
        'nuggets':['チキンマックナゲット','chickenmcnuggets']
    }[kind]
    candidates=[]
    for href,label in parser.links:
        if not href: continue
        n=norm(label)
        if any(norm(term) in n or n in norm(term) for term in terms if n):
            url=urllib.parse.urljoin(SIDE_URL,href)
            if '/products/' in url: candidates.append((url,label))
    uniq=[]
    for item in candidates:
        if item[0] not in [x[0] for x in uniq]: uniq.append(item)
    if not uniq: raise RuntimeError(f'Could not discover official side product link: {kind}')
    return uniq[0][0]

def with_size(url,size):
    parsed=urllib.parse.urlparse(url)
    q=urllib.parse.parse_qs(parsed.query)
    q.pop('size',None)
    if size=='S': q['size']=['2']
    elif size=='L': q['size']=['3']
    query=urllib.parse.urlencode(q,doseq=True)
    return urllib.parse.urlunparse(parsed._replace(query=query))

def row_value(parser,labels):
    normalized=[norm(x) for x in labels if norm(x)]
    for row in parser.rows:
        if not row: continue
        first=norm(row[0])
        if any(label in first for label in normalized):
            for cell in row[1:]:
                v=number(cell)
                if v is not None: return v
        joined=norm(' '.join(row))
        if any(label in joined for label in normalized):
            nums=[number(cell) for cell in row]
            nums=[v for v in nums if v is not None]
            if nums: return nums[-1]
    return None

def parse_product_page(url,entry):
    text,p,_=fetch(url)
    values={
        'kcal':row_value(p,['エネルギー','energy']),
        'p':row_value(p,['たんぱく質','protein']),
        'f':row_value(p,['脂質','fat']),
        'c':row_value(p,['炭水化物','carbohydrate'])
    }
    if any(v is None for v in values.values()):
        flat=clean_text(' '.join(p.all_text))
        patterns={
            'kcal':r'(?:エネルギー|Energy)[^0-9]{0,30}(\d+(?:\.\d+)?)',
            'p':r'(?:たんぱく質|Protein)[^0-9]{0,30}(\d+(?:\.\d+)?)',
            'f':r'(?:脂質|Fat)[^0-9]{0,30}(\d+(?:\.\d+)?)',
            'c':r'(?:炭水化物|Carbohydrate)[^0-9]{0,30}(\d+(?:\.\d+)?)'
        }
        for k,pat in patterns.items():
            if values[k] is None:
                m=re.search(pat,flat,re.I); values[k]=float(m.group(1)) if m else None
    if any(v is None for v in values.values()):
        raise RuntimeError(f'Could not parse nutrition from official product page: {url} -> {values}')
    return {
        'canonicalId':entry['canonicalId'],'name':entry['name'],'officialName':entry['officialName'],
        'sourceUrl':url,'nutrition':{'p':values['p'],'f':values['f'],'c':values['c'],'kcal':values['kcal'],'a':0.0}
    }

def official_records(entries):
    _,list_parser,_=fetch(LIST_URL)
    records=parse_burger_list(list_parser,entries)
    _,side_parser,_=fetch(SIDE_URL)
    fries=discover_side_link(side_parser,'fries')
    nuggets=discover_side_link(side_parser,'nuggets')
    for entry in entries:
        if entry.get('sourceMode')!='side-product': continue
        if entry['canonicalId'].startswith('restaurant:mcd-jp:fries-'):
            url=with_size(fries,entry.get('size'))
        elif entry['canonicalId']=='restaurant:mcd-jp:nuggets-5':
            url=nuggets
        else: continue
        records[entry['canonicalId']]=parse_product_page(url,entry)
    return records

def diff(entry,official):
    changed=[]; current=entry.get('nutrition') or {}; target=official.get('nutrition') or {}
    for k in ('p','f','c'):
        if abs(float(current.get(k,0))-float(target.get(k,0)))>0.051: changed.append(k)
    if abs(float(current.get('kcal',0))-float(target.get('kcal',0)))>0.51: changed.append('kcal')
    if norm(entry.get('officialName'))!=norm(official.get('officialName')): changed.append('officialName')
    if entry.get('sourceUrl')!=official.get('sourceUrl'): changed.append('sourceUrl')
    return changed

def render_md(report):
    lines=['# McDonald\'s Japan Food Master reconciliation','',f"- Checked: `{report['checked']}`",f"- Confirmed: `{report['confirmed']}`",f"- Drift: `{report['drift']}`",f"- Missing: `{report['missing']}`",f"- Official snapshot SHA-256: `{report['sourceSnapshotSha256']}`",f"- Burger nutrition source: `{LIST_URL}`",f"- Side discovery source: `{SIDE_URL}`",'']
    if report['drift'] or report['missing']:
        lines += ['| Food | Status | Changed | Official source |','|---|---|---|---|']
        for row in report['entries']:
            if row['status']!='confirmed': lines.append(f"| {row['name']} | {row['status']} | {', '.join(row.get('changed',[]))} | {row.get('official',{}).get('sourceUrl','')} |")
    else: lines.append('All McDonald\'s Japan-backed Food Master entries match the current official sources.')
    return '\n'.join(lines)+'\n'

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--registry',required=True); ap.add_argument('--out-json',default='mcd-jp-reconcile-report.json'); ap.add_argument('--out-md',default='mcd-jp-reconcile-report.md'); args=ap.parse_args()
    entries=parse_registry(args.registry); official=official_records(entries)
    results=[]
    for entry in entries:
        off=official.get(entry['canonicalId'])
        if not off:
            results.append({'name':entry['name'],'canonicalId':entry['canonicalId'],'status':'missing','changed':[],'stored':entry,'official':None}); continue
        changed=diff(entry,off)
        results.append({'name':entry['name'],'canonicalId':entry['canonicalId'],'status':'drift' if changed else 'confirmed','changed':changed,'stored':entry,'official':off})
    normalized=[official[k] for k in sorted(official)]
    snapshot=hashlib.sha256(json.dumps(normalized,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    report={'schemaVersion':1,'generatedAt':datetime.now(timezone.utc).isoformat(),'checked':len(entries),'confirmed':sum(r['status']=='confirmed' for r in results),'drift':sum(r['status']=='drift' for r in results),'missing':sum(r['status']=='missing' for r in results),'sourceSnapshotSha256':snapshot,'entries':results}
    Path(args.out_json).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); Path(args.out_md).write_text(render_md(report),encoding='utf-8')
    print(f"MCD_JP_RECONCILE checked={report['checked']} confirmed={report['confirmed']} drift={report['drift']} missing={report['missing']} sha256={snapshot}")
    return 0

if __name__=='__main__': sys.exit(main())
