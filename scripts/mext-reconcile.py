#!/usr/bin/env python3
import argparse, hashlib, html.parser, json, math, re, sys, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from openpyxl import load_workbook

MEXT_PAGE = 'https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html'
UA = 'TAMAFIT-PFC-FoodMaster-Reconciler/1.1 (+https://github.com/TAMAFIT/pfc-mirror)'

class Links(html.parser.HTMLParser):
    def __init__(self): super().__init__(); self.links=[]; self.href=None; self.buf=[]
    def handle_starttag(self, tag, attrs):
        if tag.lower()=='a': self.href=dict(attrs).get('href'); self.buf=[]
    def handle_data(self, data):
        if self.href is not None: self.buf.append(data)
    def handle_endtag(self, tag):
        if tag.lower()=='a' and self.href is not None:
            self.links.append((self.href, ''.join(self.buf).strip())); self.href=None; self.buf=[]

def fetch_bytes(url):
    req=urllib.request.Request(url, headers={'User-Agent':UA})
    with urllib.request.urlopen(req, timeout=45) as r: return r.read(), r.headers.get('Content-Type','')

def discover_workbook(page=MEXT_PAGE):
    body,_=fetch_bytes(page); p=Links(); p.feed(body.decode('utf-8','replace')); out=[]
    for href,text in p.links:
        if not href: continue
        url=urllib.parse.urljoin(page,href)
        if not url.lower().endswith(('.xlsx','.xls')): continue
        t=re.sub(r'\s+','',text); score=0
        if '第2章' in t: score+=20
        if 'データ' in t: score+=10
        if all(x not in t for x in ('第1表','第2表','第3表','第4表','別表')): score+=5
        if '正誤' in t: score-=100
        out.append((score,url,text))
    if not out: raise RuntimeError('No MEXT main-table workbook link found')
    out.sort(reverse=True); score,url,text=out[0]
    if score<20: raise RuntimeError(f'Low-confidence workbook discovery: {text} -> {url}')
    return url,text

def norm_item(v):
    if v is None: return ''
    if isinstance(v,(int,float)) and not isinstance(v,bool):
        if isinstance(v,float) and not v.is_integer(): return ''
        return str(int(v)).zfill(5)
    s=str(v).strip()
    m=re.search(r'(?<!\d)(\d{5})(?!\d)', s)
    if m: return m.group(1)
    d=re.sub(r'\D','',s)
    return d.zfill(5) if 0 < len(d) <= 5 else ''

def num(v):
    if v is None or v=='': return None
    if isinstance(v,(int,float)) and not isinstance(v,bool):
        if isinstance(v,float) and math.isnan(v): return None
        return float(v)
    s=str(v).strip().replace('＊','').replace('*','').replace(',','')
    if s in {'-','…','...'}: return None
    if s.lower() in {'tr','(tr)'}: return 0.0
    if s.startswith('(') and s.endswith(')'): s=s[1:-1].strip()
    try: return float(s)
    except ValueError: return None

def text(v): return '' if v is None else str(v).strip()
def hnorm(s): return re.sub(r'[\s\u3000]+','', text(s)).replace('（','(').replace('）',')')

def expanded_header_map(ws, rows=40, cols=160):
    rows=min(rows,ws.max_row); cols=min(cols,ws.max_column)
    merged={}
    for rg in ws.merged_cells.ranges:
        if rg.min_row>rows or rg.min_col>cols: continue
        val=ws.cell(rg.min_row,rg.min_col).value
        if val is None: continue
        for r in range(rg.min_row,min(rg.max_row,rows)+1):
            for c in range(rg.min_col,min(rg.max_col,cols)+1): merged[(r,c)]=val
    values={}; tokens={}
    for c in range(1,cols+1):
        vals=[]
        for r in range(1,rows+1):
            v=ws.cell(r,c).value
            if v is None: v=merged.get((r,c))
            s=hnorm(v)
            if s and s not in vals: vals.append(s)
        values[c]=vals; tokens[c]='|'.join(vals)
    return values,tokens

def pick_columns(wb):
    best=None; diagnostics=[]
    for ws in wb.worksheets:
        vals,toks=expanded_header_map(ws)
        def pick(fn):
            hits=[]
            for c,t in toks.items():
                sc=fn(t,vals[c])
                if sc: hits.append((sc,c,t))
            return sorted(hits, reverse=True)[0] if hits else None
        food=pick(lambda t,v: 200 if '食品番号' in t else 0)
        name=pick(lambda t,v: 200 if '食品名' in t else 0)
        kcal=pick(lambda t,v: 220 if 'kcal' in t.lower() and 'エネルギー' in t else (180 if 'kcal' in t.lower() else 0))
        prot=pick(lambda t,v: 220 if 'たんぱく質' in t and 'アミノ酸組成' not in t else 0)
        fat=pick(lambda t,v: 220 if '脂質' in t and '脂肪酸' not in t else 0)
        carb=pick(lambda t,v: 220 if '炭水化物' in t and '利用可能炭水化物' not in t and '差引き法' not in t else 0)
        alc=pick(lambda t,v: 180 if 'アルコール' in t else 0)
        req=[food,name,kcal,prot,fat,carb]
        diagnostics.append((ws.title,{k:[x[1],x[2]] if x else None for k,x in [('food',food),('name',name),('kcal',kcal),('p',prot),('f',fat),('c',carb),('a',alc)]}))
        if all(req):
            score=sum(x[0] for x in req)+(alc[0] if alc else 0)
            cand=(score,ws,{'food_no':food[1],'food_name':name[1],'kcal':kcal[1],'p':prot[1],'f':fat[1],'c':carb[1],'a':alc[1] if alc else None})
            if best is None or cand[0]>best[0]: best=cand
    if not best:
        print('MEXT_HEADER_DIAGNOSTICS '+json.dumps(diagnostics,ensure_ascii=False), file=sys.stderr)
        raise RuntimeError('Could not locate required MEXT nutrient columns')
    return best[1],best[2]

def load_rows(path):
    wb=load_workbook(path,read_only=False,data_only=True); ws,cols=pick_columns(wb); rows={}
    for row in ws.iter_rows(values_only=True):
        def get(c): return row[c-1] if c and c-1 < len(row) else None
        item=norm_item(get(cols['food_no']))
        if len(item)!=5 or item=='00000': continue
        vals={'p':num(get(cols['p'])),'f':num(get(cols['f'])),'c':num(get(cols['c'])),'kcal':num(get(cols['kcal'])),'a':num(get(cols['a'])) if cols['a'] else 0.0}
        if all(vals[k] is None for k in ('p','f','c','kcal')): continue
        rows[item]={'itemNo':item,'officialName':text(get(cols['food_name'])),**vals}
    return rows,ws.title,cols

ENTRY=re.compile(r"name:\s*'(?P<name>[^']+)'[\s\S]*?source:\s*\{\s*kind:\s*'mext'[\s\S]*?itemNo:\s*'(?P<item>\d+)'[\s\S]*?per100g:\s*\{\s*p:\s*(?P<p>-?\d+(?:\.\d+)?),\s*f:\s*(?P<f>-?\d+(?:\.\d+)?),\s*c:\s*(?P<c>-?\d+(?:\.\d+)?),\s*kcal:\s*(?P<kcal>-?\d+(?:\.\d+)?),\s*a:\s*(?P<a>-?\d+(?:\.\d+)?)\s*\}",re.M)

def verified(paths):
    out=[]
    for p in paths:
        s=Path(p).read_text(encoding='utf-8')
        for m in ENTRY.finditer(s): out.append({'file':str(p),'name':m['name'],'itemNo':norm_item(m['item']),'per100g':{k:float(m[k]) for k in ('p','f','c','kcal','a')}})
    if not out: raise RuntimeError('No MEXT entries parsed from verified source files')
    return out

def cmp(k,a,b):
    if b is None: return {'match':False,'reason':'official-missing','stored':a,'official':None}
    tol=.51 if k=='kcal' else .051; ok=abs(float(a)-float(b))<=tol
    return {'match':ok,'stored':a,'official':b,'delta':round(float(b)-float(a),4)}

def reconcile(entries,rows):
    out=[]
    for e in entries:
        off=rows.get(e['itemNo'])
        if not off: out.append({**e,'status':'missing-item','confidence':'review','official':None,'differences':{}}); continue
        d={k:cmp(k,e['per100g'][k],off.get(k)) for k in ('p','f','c','kcal','a')}; bad=[k for k,v in d.items() if not v['match']]
        out.append({**e,'status':'confirmed' if not bad else 'drift','confidence':'high' if not bad else 'review','official':off,'differences':d,'changedFields':bad})
    return out

def markdown(r):
    lines=['# MEXT Food Master reconciliation','',f"- Checked: `{r['checked']}`",f"- Confirmed: `{r['confirmed']}`",f"- Drift: `{r['drift']}`",f"- Missing item numbers: `{r['missing']}`",f"- Official workbook: `{r['source']['workbookUrl']}`",f"- Workbook SHA-256: `{r['source']['sha256']}`",'']
    bad=[x for x in r['entries'] if x['status']!='confirmed']
    if not bad: lines.append('All MEXT-backed Food Master entries match the current official workbook.')
    else:
        lines += ['| Food | Item No | Status | Changed |','|---|---:|---|---|']
        for x in bad: lines.append(f"| {x['name']} | {x['itemNo']} | {x['status']} | {', '.join(x.get('changedFields',[])) or '-'} |")
    return '\n'.join(lines)+'\n'

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--verified',action='append',required=True); ap.add_argument('--xlsx'); ap.add_argument('--out-json',default='mext-reconcile-report.json'); ap.add_argument('--out-md',default='mext-reconcile-report.md'); ap.add_argument('--strict',action='store_true'); a=ap.parse_args()
    temp=None; url=a.xlsx; label='explicit'
    if url and Path(url).exists(): path=Path(url); url='file://'+str(path.resolve())
    else:
        if not url: url,label=discover_workbook()
        body,ctype=fetch_bytes(url)
        if not body.startswith(b'PK'): raise RuntimeError(f'Downloaded workbook is not XLSX: {ctype}')
        temp=Path('.mext-food-master.xlsx'); temp.write_bytes(body); path=temp
    sha=hashlib.sha256(path.read_bytes()).hexdigest(); rows,sheet,cols=load_rows(path); entries=verified(a.verified); results=reconcile(entries,rows)
    confirmed=sum(x['status']=='confirmed' for x in results); drift=sum(x['status']=='drift' for x in results); missing=sum(x['status']=='missing-item' for x in results)
    report={'schemaVersion':1,'generatedAt':datetime.now(timezone.utc).isoformat(),'checked':len(results),'confirmed':confirmed,'drift':drift,'missing':missing,'source':{'pageUrl':MEXT_PAGE,'workbookUrl':url,'linkText':label,'sha256':sha,'sheet':sheet,'columns':cols,'officialFoodRows':len(rows),'basis':'edible portion per 100g'},'entries':results}
    Path(a.out_json).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); Path(a.out_md).write_text(markdown(report),encoding='utf-8')
    print(f'MEXT_RECONCILE checked={len(results)} confirmed={confirmed} drift={drift} missing={missing}'); print('MEXT_WORKBOOK '+url); print('MEXT_SHA256 '+sha)
    for x in results:
        if x['status']!='confirmed': print(f"MEXT_DIFF {x['name']} item={x['itemNo']} status={x['status']} fields={','.join(x.get('changedFields',[]))}")
    if temp and temp.exists(): temp.unlink()
    return 2 if a.strict and (drift or missing) else 0

if __name__=='__main__': sys.exit(main())
