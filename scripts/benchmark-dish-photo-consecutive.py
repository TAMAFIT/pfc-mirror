import base64
import io
import json
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, TimeoutError, wait, FIRST_COMPLETED
from PIL import Image

URLS = {
    'primary': 'https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec',
    'secondary': 'https://script.google.com/macros/s/AKfycbzmnAYgNXoNbS4UYDU7t1iO70j6OeXLm5CaIaN4P-8Mx27dqLPRU20ewtGAtiJjC0Z7FA/exec',
}
IMAGE_URL = 'https://prcdn.freetls.fastly.net/release_image/18729/249/18729-249-28ac67e221d90394183b2656e4b3beb2-1080x1080.jpg'
HEDGE_DELAY = 4.5
PROMPT = '''あなたは食事写真の視覚的食品抽出器です。画像から直接見える食べ物だけを日本語で抽出してください。
- 弁当・定食・ワンプレートは全体名だけで終わらず、区別できる主食・主菜・卵・野菜・漬物・副菜を個別に拾う。
- 見えない具、味、肉の部位、ソース、調理法を補完しない。具が見えないおにぎりは「おにぎり」とだけ書く。
- 料理名を断定できない場合は安全な一般名にしてambiguityへ候補を書く。
- visibleCountは独立した同一食品の境界を1つずつ確認して数えられる場合だけ整数。同じ個体を二重に数えず、少しでも曖昧ならnullを優先する。
- 重量、ml、P/F/C、kcal、油量、調味料量は推測しない。最大10食品。'''

with urllib.request.urlopen(IMAGE_URL, timeout=20) as r:
    raw = r.read()
img = Image.open(io.BytesIO(raw)).convert('RGB')
img.thumbnail((1024, 1024))
buf = io.BytesIO()
img.save(buf, 'JPEG', quality=80)
encoded = base64.b64encode(buf.getvalue()).decode()

schema = {
    'type':'object','additionalProperties':False,
    'required':['dishName','uncertain','foods'],
    'properties':{
        'dishName':{'type':'string'},
        'uncertain':{'type':'boolean'},
        'foods':{'type':'array','maxItems':10,'items':{
            'type':'object','additionalProperties':False,
            'required':['name','visibleCount','ambiguity','note'],
            'properties':{
                'name':{'type':'string'},
                'visibleCount':{'type':['integer','null'],'minimum':1,'maximum':30},
                'ambiguity':{'type':'string'},
                'note':{'type':'string'}
            }
        }}
    }
}
payload = {
    'taskType':'image','modelPreference':'gemini-3.5-flash-lite',
    'contents':[{'parts':[{'text':PROMPT}]}],'imageBase64':encoded,
    'generationConfig':{
        'thinkingConfig':{'thinkingLevel':'minimal'},'maxOutputTokens':768,
        'responseMimeType':'application/json','responseJsonSchema':schema,
        'mediaResolution':'MEDIA_RESOLUTION_LOW'
    }
}

def call(label):
    started=time.perf_counter()
    req=urllib.request.Request(URLS[label],data=json.dumps(payload).encode(),headers={'Content-Type':'text/plain'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            body=r.read().decode(errors='replace')
            data=json.loads(body)
            text=''.join(p.get('text','') for p in data.get('candidates',[{}])[0].get('content',{}).get('parts',[]))
            parsed=json.loads(text)
            foods=parsed.get('foods',[]) if isinstance(parsed,dict) else []
            return {'label':label,'ok':r.status==200 and bool(foods),'status':r.status,'route_seconds':round(time.perf_counter()-started,3),'foods':[x.get('name') for x in foods[:5]]}
    except urllib.error.HTTPError as e:
        return {'label':label,'ok':False,'status':e.code,'route_seconds':round(time.perf_counter()-started,3)}
    except Exception as e:
        return {'label':label,'ok':False,'status':'exception','route_seconds':round(time.perf_counter()-started,3),'error':repr(e)[:160]}

def trial(number):
    overall=time.perf_counter()
    ex=ThreadPoolExecutor(max_workers=2)
    primary=ex.submit(call,'primary')
    secondary=None
    winner=None
    results=[]
    try:
        try:
            first=primary.result(timeout=HEDGE_DELAY)
            results.append(first)
            if first['ok']:
                winner=first
            else:
                secondary=ex.submit(call,'secondary')
        except TimeoutError:
            secondary=ex.submit(call,'secondary')

        if winner is None and secondary is not None:
            pending={primary,secondary}
            while pending and winner is None:
                done,pending=wait(pending,return_when=FIRST_COMPLETED)
                for future in done:
                    result=future.result()
                    if result not in results:
                        results.append(result)
                    if result['ok']:
                        winner=result
                        break
            if winner is None:
                for future in pending:
                    result=future.result()
                    if result not in results:
                        results.append(result)
                    if result['ok'] and winner is None:
                        winner=result
        elif winner is None:
            winner=results[0] if results and results[0]['ok'] else None

        effective=round(time.perf_counter()-overall,3)
        print(json.dumps({'trial':number,'effective_seconds':effective,'winner':winner,'observed':results},ensure_ascii=False))
    finally:
        ex.shutdown(wait=True,cancel_futures=False)

for i in range(1,4):
    trial(i)
    if i<3:
        time.sleep(1.5)
