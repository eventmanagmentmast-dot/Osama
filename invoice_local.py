"""Local desktop reviewer flow; field identities use the hosted portal."""
import base64,json,secrets,time
from pathlib import Path

def process(c,user,x,validate,read_data):
 if user['role'] not in {'admin','finance'}:raise ValueError('Yönetici veya muhasebe gerekli')
 data=read_data(c,'admin');old=next((r for r in data['invoiceSubmissions'] if r['id']==x.get('id')),None)
 action=x.get('action');now=time.strftime('%Y-%m-%dT%H:%M:%S');rid=old['id'] if old else secrets.token_hex(12)
 if x.get('id') and not old:raise ValueError('Başvuru bulunamadı')
 def put(kind,key,value):c.execute('INSERT OR REPLACE INTO records VALUES(?,?,?)',(kind,key,json.dumps(value,ensure_ascii=False)))
 if action=='submit':
  if old and (old['owner']!=user['name'] or old['status']!='Düzeltme istendi'):raise ValueError('Bu kayıt yeniden gönderilemez')
  record=validate('expenses',x.get('record'),c)
  submission={**record,'owner':user['name'],'status':'Onay bekliyor','submittedAt':now,'reviewer':'','reviewedAt':'','reviewNote':'','expense':''}
  file=x.get('file')
  if file:
   name=Path(file['name']).name;blob=base64.b64decode(file['data'],validate=True)
   if Path(name).suffix.lower() not in {'.pdf','.png','.jpg','.jpeg','.webp'} or len(name)>500 or len(blob)>10*1024*1024:raise ValueError('Belge geçersiz')
   fid=secrets.token_hex(12);c.execute('INSERT INTO files VALUES(?,?)',(fid,blob));put('documents',fid,{'name':name,'target':'invoiceSubmissions:'+rid})
 elif action in {'approve','return'}:
  if not old or old['status']!='Onay bekliyor':raise ValueError('Bu kayıt artık onay beklemiyor')
  if action=='return':
   note=x.get('note','')
   if not isinstance(note,str) or not note.strip() or len(note)>500:raise ValueError('Düzeltme gerekçesi gerekli')
   submission={**old,'status':'Düzeltme istendi','reviewer':user['name'],'reviewedAt':now,'reviewNote':note.strip()}
  else:
   record=validate('expenses',x.get('record'),c)
   if record['number'] and any(r.get('number')==record['number'] and r['vendor'].casefold()==record['vendor'].casefold() for r in data['expenses']):raise ValueError('Fatura zaten kayıtlı')
   expense=secrets.token_hex(12);put('expenses',expense,record)
   for d in data['documents']:
    if d['target']=='invoiceSubmissions:'+rid:put('documents',d['id'],{**d,'target':'expenses:'+expense})
   submission={**old,**record,'status':'Onaylandı','reviewer':user['name'],'reviewedAt':now,'reviewNote':'Kontrol edilerek onaylandı','expense':expense}
 else:raise ValueError('Geçersiz işlem')
 put('invoiceSubmissions',rid,submission)
