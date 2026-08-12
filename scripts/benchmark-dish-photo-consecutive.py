import base64
import io
import json
import time
import urllib.request
import urllib.error
from PIL import Image

GAS_URL = 'https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec'
IMAGE_URL = 'https://prcdn.freetls.fastly.net/release_image/18729/249/18729-249-28ac67e221d90394183b2656e4b3beb2-1080x1080.jpg'
PROMPT = '''あなたは食事写真の視覚的食品抽出器です。画像から直接見える食べ物だけを日本語で抽出してください。
弁当・定食は見分けられる食品を個別に列挙する。見えない具・味・重量・栄養値は推測しない。具が見えないおにぎりは「おにぎり」。visibleCountは明確に数えられる時だけ整数、曖昧ならnull。'''

with urllib.request.urlopen(IMAGE_URL, timeout=20) as r:
    raw = r.read()
img = Image.open(io.BytesIO(raw)).convert('RGB')
img.thumbnail((1024, 1024))
buf = io.BytesIO()
img.save(buf, 'JPEG', quality=80)
encoded = base64.b64encode(buf.getvalue()).decode()

schema = {
    'type':'object',
    'additionalProperties':False,
    'required':['dishName','uncertain','foods'],
    'properties':{
        'dishName':{'type':'string'},
        'uncertain':{'type':'boolean'},
        'foods':{
            'type':'array','maxItems':10,
            'items':{
                'type':'object','additionalProperties':False,
                'required':['name','visibleCount','ambiguity','note'],
                'properties':{
                    'name':{'type':'string'},
                    'visibleCount':{'type':['integer','null'],'minimum':1,'maximum':30},
                    'ambiguity':{'type':'string'},
                    'note':{'type':'string'}
                }
            }
        }
    }
}

payload = {
    'taskType':'image',
    'modelPreference':'gemini-3.5-flash-lite',
    'contents':[{'parts':[{'text':PROMPT}]}],
    'imageBase64':encoded,
    'generationConfig':{
        'thinkingConfig':{'thinkingLevel':'minimal'},
        'maxOutputTokens':768,
        'responseMimeType':'application/json',
        'responseJsonSchema':schema,
        'mediaResolution':'MEDIA_RESOLUTION_LOW'
    }
}

req = urllib.request.Request(GAS_URL,data=json.dumps(payload).encode(),headers={'Content-Type':'text/plain'},method='POST')
started=time.perf_counter()
try:
    with urllib.request.urlopen(req,timeout=35) as r:
        body=r.read().decode(errors='replace')
        print(json.dumps({'status':r.status,'seconds':round(time.perf_counter()-started,3),'body':body[:5000]},ensure_ascii=False))
except urllib.error.HTTPError as e:
    print(json.dumps({'status':e.code,'seconds':round(time.perf_counter()-started,3),'body':e.read().decode(errors='replace')[:2000]},ensure_ascii=False))
