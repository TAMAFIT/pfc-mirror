import base64
import io
import json
import time
import urllib.request
import urllib.error
from PIL import Image

GAS_URL='https://script.google.com/macros/s/AKfycbztOxv7AgVYClZE-1yzTLTqO9mlm4oqDYWqoNgm3d5LECBzJQm97qfDhtedlpg5caA0cA/exec'
IMAGE_URL='https://prcdn.freetls.fastly.net/release_image/18729/249/18729-249-28ac67e221d90394183b2656e4b3beb2-1080x1080.jpg'
PROMPT='''あなたは食事写真の視覚的食品抽出器です。画像から直接見える食べ物だけを日本語で抽出してください。
弁当・定食は食品を個別に列挙する。見えない具・味・調理法・重量・栄養値は推測しない。具が見えないおにぎりは「おにぎり」。visibleCountは明確に数えられる時だけ整数、曖昧ならnull。最大10食品。'''
with urllib.request.urlopen(IMAGE_URL,timeout=20) as r: raw=r.read()
img=Image.open(io.BytesIO(raw)).convert('RGB'); img.thumbnail((1024,1024))
buf=io.BytesIO(); img.save(buf,'JPEG',quality=80); encoded=base64.b64encode(buf.getvalue()).decode()
schema={'type':'object','additionalProperties':False,'required':['dishName','uncertain','foods'],'properties':{'dishName':{'type':'string'},'uncertain':{'type':'boolean'},'foods':{'type':'array','maxItems':10,'items':{'type':'object','additionalProperties':False,'required':['name','visibleCount','ambiguity','note'],'properties':{'name':{'type':'string'},'visibleCount':{'type':['integer','null'],'minimum':1,'maximum':30},'ambiguity':{'type':'string'},'note':{'type':'string'}}}}}}
payload={'taskType':'image','modelPreference':'gemini-3.5-flash-lite','contents':[{'parts':[{'text':PROMPT}]}],'imageBase64':encoded,'generationConfig':{'thinkingConfig':{'thinkingLevel':'minimal'},'maxOutputTokens':768,'responseMimeType':'application/json','responseJsonSchema':schema,'mediaResolution':'MEDIA_RESOLUTION_LOW'}}

def run(i):
    req=urllib.request.Request(GAS_URL,data=json.dumps(payload).encode(),headers={'Content-Type':'text/plain'},method='POST')
    started=time.perf_counter()
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            body=r.read().decode(errors='replace')
            print(json.dumps({'attempt':i,'status':r.status,'seconds':round(time.perf_counter()-started,3),'content_type':r.headers.get('content-type'),'final_url':r.geturl(),'body_prefix':body[:500]},ensure_ascii=False))
    except urllib.error.HTTPError as e:
        print(json.dumps({'attempt':i,'status':e.code,'seconds':round(time.perf_counter()-started,3),'final_url':e.geturl(),'body_prefix':e.read().decode(errors='replace')[:300]},ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'attempt':i,'status':'exception','seconds':round(time.perf_counter()-started,3),'error':repr(e)},ensure_ascii=False))

for i in range(1,4):
    run(i)
    if i<3: time.sleep(1.5)
