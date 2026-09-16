import json,secrets,time

def process(c,user,x,read_data):
 if user['role'] not in {'admin','finance','operations'}:raise ValueError('Yetki yok')
 data=read_data(c,'admin');now=time.strftime('%Y-%m-%dT%H:%M:%S')
 def put(k,rid,r):c.execute('INSERT OR REPLACE INTO records VALUES(?,?,?)',(k,rid,json.dumps(r,ensure_ascii=False)))
 if x.get('action')=='request':
  if x.get('change') not in {'Ekle / güncelle','Kaldır'} or not any(p['id']==x.get('product') for p in data['products']):raise ValueError('Ürün ve işlem seçin')
  if any(r['product']==x['product'] and r['status']=='Onay bekliyor' for r in data['catalogueRequests']):raise ValueError('Bekleyen talep var')
  put('catalogueRequests',secrets.token_hex(12),{'product':x['product'],'change':x['change'],'status':'Onay bekliyor','owner':user['name'],'at':now,'reviewer':'','reviewedAt':'','note':''});return
 if user['role']!='admin':raise ValueError('Yönetici gerekli')
 r=next((r for r in data['catalogueRequests'] if r['id']==x.get('id')),None)
 if not r or r['status']!='Onay bekliyor':raise ValueError('Talep artık açık değil')
 if x.get('action') not in {'approve','reject'}:raise ValueError('Geçersiz işlem')
 if x['action']=='reject' and (not isinstance(x.get('note'),str) or not x['note'].strip() or len(x['note'])>500):raise ValueError('Ret gerekçesi gerekli')
 if x['action']=='approve':
  p=next(p for p in data['products'] if p['id']==r['product']);old=next((e for e in data['catalogueEntries'] if e['product']==p['id']),None)
  if r['change']=='Kaldır':
   if not old:raise ValueError('Ürün katalogda yok')
   entry={**old,'status':'Kaldırıldı'}
  else:
   entry={k:p.get(k,'') for k in ['name','code','brand','model','category','dimensions','accessories']};entry.update(product=p['id'],description=p.get('technicalNote',''),status='Yayında',photoIds=','.join(d['id'] for d in data['documents'] if d['target']=='products:'+p['id'] and d['name'].lower().endswith(('.png','.jpg','.jpeg','.webp')))[:500])
  entry.update(approvedBy=user['name'],approvedAt=now);put('catalogueEntries',p['id'],entry)
 put('catalogueRequests',r['id'],{**r,'status':'Onaylandı' if x['action']=='approve' else 'Reddedildi','reviewer':user['name'],'reviewedAt':now,'note':x.get('note','')})
