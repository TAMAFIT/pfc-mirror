import base64
import io
import json
import time
import urllib.request
import urllib.error
from PIL import Image

GAS_URL='https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec'
IMAGE_URL='https://prcdn.freetls.fastly.net/release_image/18729/249/18729-249-28ac67e221d90394183b2656e4b3beb2-1080x1080.jpg'
PROMPT='''あなたは食事写真の視覚的食品抽出器です。画像から直接見える食べ物だけを日本語で抽出してください。
- 弁当・定食・ワンプレートは全体名だけで終わらず、区別できる主食・主菜・卵・野菜・漬物・副菜を個別に拾う。
- 見えない具、味、肉の部位、ソース、調理法を補完しない。具が見えないおにぎりは「おにぎり」とだけ書く。
- 料理名を断定できない場合は安全な一般名にしてambiguityへ候補を書く。
- visibleCountは独立した同一食品の境界を1つずつ確認して数えられる場合だけ整数。同じ個体を二重に数えず、少しでも曖昧ならnullを優先する。
- 重量、ml、P/F/C、kcal、油量、調味料量は推測しない。最大10食品。'''

with urllib.request.urlopen(IMAGE_URL,timeout=20) as r: SOURCE=r.read()
schema={'type':'object','additionalProperties':False,'required':['dishName','uncertain','foods'],'properties':{'dishName':{'type':'string'},'uncertain':{'type':'boolean'},'foods':{'type':'array','maxItems':10,'items':{'type':'object','additionalProperties':False,'required':['name','visibleCount','ambiguity','note'],'properties':{'name':{'type':'string'},'visibleCount':{'type':['integer','null'],'minimum':1,'maximum':30},'ambiguity':{'type':'string'},'note':{'type':'string'}}}}}}

def make_payload(side, quality):
    img=Image.open(io.BytesIO(SOURCE)).convert('RGB'); img.thumbnail((side,side))
    buf=io.BytesIO(); img.save(buf,'JPEG',quality=quality,optimize=True)
    raw=buf.getvalue(); encoded=base64.b64encode(raw).decode()
    payload={'taskType':'image','modelPreference':'gemini-3.5-flash-lite','contents':[{'parts':[{'text':PROMPT}]}],'imageBase64':encoded,'generationConfig':{'thinkingConfig':{'thinkingLevel':'minimal'},'maxOutputTokens':768,'responseMimeType':'application/json','responseJsonSchema':schema,'mediaResolution':'MEDIA_RESOLUTION_LOW'}}
    body=json.dumps(payload,separators=(',',':')).encode()
    return body,len(raw),img.size

def run(side, quality, attempt):
    body,jpeg_bytes,dims=make_payload(side,quality)
    req=urllib.request.Request(GAS_URL,data=body,headers={'Content-Type':'text/plain'},method='POST')
    started=time.perf_counter()
    result={'side':side,'quality':quality,'attempt':attempt,'jpeg_bytes':jpeg_bytes,'post_bytes':len(body),'dims':dims}
    try:
        with urllib.request.urlopen(req,timeout=25) as r:
            response_body=r.read().decode(errors='replace')
            result.update(status=r.status,seconds=round(time.perf_counter()-started,3))
            try:
                outer=json.loads(response_body)
                text=''.join(p.get('text','') for p in outer.get('candidates',[{}])[0].get('content',{}).get('parts',[]))
                inner=json.loads(text)
                foods=inner.get('foods',[]) if isinstance(inner,dict) else []
                result['foods']=[{'name':x.get('name'),'count':x.get('visibleCount')} for x in foods[:10]]
                result['valid']=bool(foods)
            except Exception as e:
                result['valid']=False; result['parse_error']=repr(e)[:180]; result['prefix']=response_body[:180]
    except urllib.error.HTTPError as e:
        result.update(status=e.code,seconds=round(time.perf_counter()-started,3),valid=False,prefix=e.read().decode(errors='replace')[:120])
    except Exception as e:
        result.update(status='exception',seconds=round(time.perf_counter()-started,3),valid=False,error=repr(e)[:180])
    print(json.dumps(result,ensure_ascii=False))

for side,quality in [(512,62),(384,62)]:
    for i in range(1,4):
        run(side,quality,i)
        time.sleep(1.5)
