import base64
import io
import json
import os
import time
import urllib.error
import urllib.request
from PIL import Image

GAS_URL = os.environ['GAS_URL']
IMAGE_URL = os.environ['IMAGE_URL']

PROMPT = '''あなたは食事写真の視覚的食品抽出器です。画像から直接見える食べ物だけを日本語で抽出し、JSONだけ返してください。
- 弁当・定食・ワンプレートは全体名だけで終わらず、区別できる主食・主菜・卵・野菜・漬物・副菜を個別に拾う。
- 見えない具、味、肉の部位、ソース、調理法を補完しない。具が見えないおにぎりは「おにぎり」とだけ書く。
- 料理名を断定できない場合は安全な一般名にしてambiguityへ候補を書く。
- visibleCountは独立した同一食品の境界を1つずつ確認して数えられる場合だけ整数。同じ個体を二重に数えず、別の副菜や飾りを混ぜない。少しでも曖昧ならnullを優先する。
- 重量、ml、P/F/C、kcal、油量、調味料量は推測しない。
- 食品でない画像はfoods=[]。説明文・Markdownは禁止。
形式: {"dishName":"","uncertain":true,"foods":[{"name":"","visibleCount":null,"ambiguity":"","note":""}]}
最大10食品。'''

with urllib.request.urlopen(IMAGE_URL, timeout=20) as response:
    raw = response.read()
image = Image.open(io.BytesIO(raw)).convert('RGB')
image.thumbnail((720, 720))
buffer = io.BytesIO()
image.save(buffer, 'JPEG', quality=80)
encoded = base64.b64encode(buffer.getvalue()).decode()

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
request = urllib.request.Request(
    GAS_URL,
    data=json.dumps(payload).encode(),
    headers={'Content-Type': 'text/plain'},
    method='POST',
)
started = time.perf_counter()
try:
    with urllib.request.urlopen(request, timeout=45) as response:
        body = response.read().decode(errors='replace')
        print(json.dumps({
            'label': 'v34-low-media-resolution',
            'model': 'gemini-3.5-flash-lite',
            'status': response.status,
            'seconds': round(time.perf_counter() - started, 3),
            'image_bytes': len(buffer.getvalue()),
            'body': body[:6000],
        }, ensure_ascii=False))
except urllib.error.HTTPError as error:
    body = error.read().decode(errors='replace')
    print(json.dumps({
        'label': 'v34-low-media-resolution',
        'model': 'gemini-3.5-flash-lite',
        'status': error.code,
        'seconds': round(time.perf_counter() - started, 3),
        'body': body[:1200],
    }, ensure_ascii=False))
