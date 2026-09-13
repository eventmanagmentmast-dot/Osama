import json
from datetime import datetime
SCHEMA={
'warehouses':[('name','Depo adı','text'),('location','Adres / bölüm','text'),('owner','Depo sorumlusu','text')],
'products':[('code','Ürün kodu','text'),('name','Ürün adı','text'),('category','Kategori','enum:Ses,Işık,Görüntü,Sahne,Mobilya,Dekor,Kablo / aksesuar,Diğer'),('unit','Birim','enum:Adet,Set,Metre'),('tracking','Takip','enum:Adet havuzu,Tekil varlık'),('serial','Seri no (tekil varlıkta)','optional'),('minimum','Uyarı eşiği','nonnegative')],
'stockMoves':[('product','Ürün','ref:products'),('warehouse','Kaynak / işlem deposu','ref:warehouses'),('destination','Hedef depo (transferde)','optref:warehouses'),('date','Hareket zamanı (Türkiye)','datetime'),('type','Hareket','enum:Giriş,Çıkış,Transfer'),('condition','Durum','enum:Kullanılabilir,Hasarlı'),('quantity','Miktar','integer'),('note','Belge / açıklama','text')],
'rentals':[('event','Etkinlik (varsa)','optref:events'),('customer','Kiracı / müşteri','text'),('product','Ürün','ref:products'),('warehouse','Çıkış deposu','ref:warehouses'),('quantity','Kiralanan miktar','integer'),('start','Rezervasyon başlangıcı (Türkiye)','datetime'),('end','Planlanan iade (Türkiye)','datetime'),('billDays','Ücretlendirilen gün','integer'),('dailyRate','Birim günlük net kira TL','money'),('discount','Toplam net indirim TL','money'),('vat','Toplam KDV TL','money'),('incomeMode','Gelir sayımı','enum:Bağımsız gelir,Etkinlik sözleşmesine dahil'),('billing','Fatura durumu','enum:Teklif,Faturalandı'),('status','Rezervasyon','enum:Taslak,Onaylandı,İptal')],
'dispatches':[('rental','Kiralama','ref:rentals'),('date','Teslim zamanı (Türkiye)','datetime'),('quantity','Teslim edilen miktar','integer'),('recipient','Teslim alan','text'),('reference','Teslim belgesi / not','text')],
'returns':[('rental','Kiralama','ref:rentals'),('warehouse','İade deposu','ref:warehouses'),('date','İade / tespit zamanı (Türkiye)','datetime'),('quantity','Miktar','integer'),('condition','Durum','enum:Hasarsız,Hasarlı,Kayıp'),('reference','İade / hasar belgesi notu','text')],
'rentalReceipts':[('rental','Kiralama','ref:rentals'),('date','Tarih','date'),('kind','İşlem','enum:Kira tahsilatı,Depozito alındı,Depozito iade edildi'),('amount','Tutar TL','money'),('method','Yöntem','enum:Nakit,Havale,POS'),('note','Açıklama','optional')]
}
def validate(kind,record,c,rid):
 if kind not in SCHEMA:return
 data={k:{} for k in SCHEMA}
 for r in c.execute('SELECT * FROM records'):
  if r['kind'] in data:data[r['kind']][r['id']]=json.loads(r['payload'])
 data[kind][rid]=record
 codes=[p['code'].casefold() for p in data['products'].values()]
 if len(codes)!=len(set(codes)):raise ValueError('Ürün kodu benzersiz olmalı')
 for p in data['products'].values():
  if p['tracking']=='Tekil varlık' and not p['serial']:raise ValueError('Tekil varlık için seri numarası gerekli')
 for rental in data['rentals'].values():
  if rental['end']<=rental['start']:raise ValueError('İade zamanı başlangıçtan sonra olmalı')
  if rental['discount']>rental['quantity']*rental['billDays']*rental['dailyRate']:raise ValueError('İndirim kira bedelini aşamaz')
  if rental['incomeMode']=='Etkinlik sözleşmesine dahil' and not rental['event']:raise ValueError('Sözleşmeye dahil kiralama için etkinlik seçin')
  if data['products'][rental['product']]['tracking']=='Tekil varlık' and rental['quantity']!=1:raise ValueError('Tekil varlık miktarı 1 olmalı')
 # Replay real movements; editing older records cannot create negative stock later.
 events=[]
 for m in data['stockMoves'].values():
  if m['type']=='Transfer' and (not m['destination'] or m['destination']==m['warehouse']):raise ValueError('Transfer için farklı hedef depo gerekli')
  events.append((m['date'],0,m['warehouse'],m['product'],m['condition'],m['quantity']*(1 if m['type']=='Giriş' else -1)))
  if m['type']=='Transfer':events.append((m['date'],1,m['destination'],m['product'],m['condition'],m['quantity']))
 for rid2,r in data['rentals'].items():
  dispatched=[x for x in data['dispatches'].values() if x['rental']==rid2];returned=[x for x in data['returns'].values() if x['rental']==rid2]
  if dispatched and r['status']!='Onaylandı':raise ValueError('Teslimi olan kiralama onaylı kalmalı')
  if sum(x['quantity'] for x in dispatched)>r['quantity']:raise ValueError('Teslim miktarı kiralama miktarını aşamaz')
  progress=[]
  for d in dispatched:
   events.append((d['date'],2,r['warehouse'],r['product'],'Kullanılabilir',-d['quantity']));progress.append((d['date'],0,d['quantity']))
  for ret in returned:
   progress.append((ret['date'],1,-ret['quantity']))
   if ret['condition']!='Kayıp':events.append((ret['date'],3,ret['warehouse'],r['product'],'Hasarlı' if ret['condition']=='Hasarlı' else 'Kullanılabilir',ret['quantity']))
  remaining=0
  for _,_,q in sorted(progress):
   remaining+=q
   if remaining<0:raise ValueError('İade/kayıp toplamı o tarihe kadar teslim edileni aşamaz')
  deposit=0
  for receipt in sorted([x for x in data['rentalReceipts'].values() if x['rental']==rid2],key=lambda x:(x['date'],0 if x['kind']=='Depozito alındı' else 1)):
   if receipt['kind']=='Depozito alındı':deposit+=receipt['amount']
   if receipt['kind']=='Depozito iade edildi':deposit-=receipt['amount']
   if deposit<0:raise ValueError('İade edilen depozito alınan depozitoyu aşamaz')
 balances={}
 for _,_,warehouse,product,condition,q in sorted(events):
  key=(warehouse,product,condition);balances[key]=balances.get(key,0)+q
  if balances[key]<0:raise ValueError('Stok yetersiz: '+data['products'][product]['name']+' / '+condition)
 for product,p in data['products'].items():
  if p['tracking']=='Tekil varlık':
   physical=sum(q for (w,pr,cond),q in balances.items() if pr==product)
   outside=sum(sum(d['quantity'] for d in data['dispatches'].values() if d['rental']==r)-sum(t['quantity'] for t in data['returns'].values() if t['rental']==r) for r,x in data['rentals'].items() if x['product']==product)
   if physical+outside>1:raise ValueError('Tekil varlık için toplam stok 1 adedi aşamaz')
