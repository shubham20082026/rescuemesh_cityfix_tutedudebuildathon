"""Developer build: retain the existing dataset when rebuilding the UI."""
from pathlib import Path
import json
import re
p=Path(__file__).parent
html_path=p/'RescueMesh.html'
if (p/'data.json').exists():
    data=json.loads((p/'data.json').read_text(encoding='utf-8'))
else:
    previous=html_path.read_text(encoding='utf-8')
    match=re.search(r'<script id="rescuemesh-data" type="application/json">(.*?)</script>',previous,re.S)
    if not match:raise ValueError('Keep the delivered HTML or your data.json beside the source before rebuilding.')
    data=json.loads(match[1])
text=(p/'index.template.html').read_text(encoding='utf-8')
for key,name in [('CSS','styles.css'),('ENGINE','engine.js'),('APP','app.js')]:
    text=text.replace('/*__'+key+'__*/',(p/name).read_text(encoding='utf-8'))
text=text.replace('/*__DATA__*/',json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'))
html_path.write_text(text,encoding='utf-8')
print('Rebuilt RescueMesh.html; retained dataset status:',data.get('status'))
