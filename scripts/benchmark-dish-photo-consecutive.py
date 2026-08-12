import base64
import io
import json
import time
import urllib.request
import urllib.error
from PIL import Image

URLS = {
    'prod-v3': 'https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec',
    'head': 'https://script.google.com/macros/s/AKfycbzCobPooFoCOXDhCTCQR4xYdVcaCEDlfKx9L9wvhLw_/exec',
}
IMAGE_URL = 'https://prcdn.freetls.fastly.net/release_image/18729/249/18729-249-28ac67e221d90394183b2656e4b3beb2-1080x1080.jpg'
PROMPT = '''あなたは食事写真の視覚的食品抽出器です。画像から直接見える食べ物だけを日本語で抽出し、JSONだけ返してください。
- 弁当・定食・ワンプレートは全体名だけで終わらず、区別できる主食・主菜・卵・野菜・漬物・副菜を個別に拾う。
- 見えない具、味、肉の部位、ソース、調理法を補完しない。具が見えないおにぎりは「おにぎり」とだけ書く。
- 料理名を断定できない場合は安全な一般名にしてambiguityへ候補を書く。
- visibleCountは独立した同一食品の境界を1つずつ確認して数えられる場合だけ整数。少しでも曖昧ならnull。
- 重量、ml、P/F/C、kcal、油量、調味料量は推測しない。
形式: {"dishName":"","uncertain":true,"foods":[{"name":"","visibleCount":null,"ambiguity":"","note":""}]}
最大10食品。'''

with urllib.request.urlopen(IMAGE_URL, timeout=20) as r:
    raw = r.read()
img = Image.open(io.BytesIO(raw)).convert('RGB')
img.thumbnail((1024, 1024))
buf = io.BytesIO()
img.save(buf, 'JPEG', quality=80)
encoded = base64.b64encode(buf.getvalue()).decode()

payload = {
    'taskType': 'image',
    'modelPreference': 'gemini-3.5-flash-lite',
    'contents': [{'parts': [{'text': PROMPT}]}],
    'imageBase64': encoded,
    'generationConfig': {
        'thinkingConfig': {'thinkingLevel': 'minimal'},
        'maxOutputTokens': 768,
        'responseMimeType': 'application/json',
        'mediaResolution': 'MEDIA_RESOLUTION_LOW',
    },
}

def one(label, i):
    url = URLS[label]
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Content-Type':'text/plain'}, method='POST')
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=35) as r:
            body = r.read().decode(errors='replace')
            print(json.dumps({'deployment':label,'attempt':i,'status':r.status,'seconds':round(time.perf_counter()-started,3),'final_url':r.geturl(),'body':body[:1000]}, ensure_ascii=False))
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors='replace')
        print(json.dumps({'deployment':label,'attempt':i,'status':e.code,'seconds':round(time.perf_counter()-started,3),'final_url':e.geturl(),'body':body[:1000]}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'deployment':label,'attempt':i,'status':'exception','seconds':round(time.perf_counter()-started,3),'error':repr(e)}, ensure_ascii=False))

for i in range(1,3):
    one('prod-v3', i)
    time.sleep(1.5)
    one('head', i)
    if i < 2:
        time.sleep(1.5)
