import json
from server import SCHEMA,ROOT
D={k:[] for k in SCHEMA}
def add(k,id,**r):D[k].append(dict(id=id,**r))
add('events','e1',name='Sonbahar Müzik Festivali',client='Rota Kültür (örnek)',date='2026-09-26',venue='İstanbul · Açık hava',revenue=1800000,budget=1300000,vat=360000)
add('events','e2',name='Tasarım Fuarı',client='Tasarım Platformu (örnek)',date='2026-10-02',venue='İzmir · Fuar alanı',revenue=950000,budget=680000,vat=190000)
add('events','e3',name='Mağaza Açılışı',client='Merkez Perakende (örnek)',date='2026-09-26',venue='Ankara · Mağaza',revenue=320000,budget=220000,vat=64000)
add('cards','c1',name='Şirket kartı (örnek)',last4='4821',limit=500000)
add('cards','c2',name='Operasyon kartı (örnek)',last4='7356',limit=250000)
for i,(event,vendor,net,vat) in enumerate([('e1','Sahne Teknik (örnek)',420000,84000),('e1','Sanatçı Ajansı (örnek)',210000,42000),('e2','Stant Atölyesi (örnek)',150000,30000),('e3','İkram Firması (örnek)',55000,11000)]):
 add('expenses','g'+str(i),event=event,vendor=vendor,description=['Teknik sistemler','Sanatçı hizmeti','Stant üretimi','İkram'][i],net=net,vat=vat,document='Faturalı',number='DEMO-'+str(i+1),due='2026-09-25')
add('expenses','g4',event='e1',vendor='Saha gideri (örnek)',description='Belgesi bekleyen gider; tutar teyidi gerekli',net=5000,vat=0,document='Belge bekleniyor',number='',due='2026-09-12')
add('payments','p1',expense='g0',date='2026-09-10',amount=120000,method='Kredi kartı',card='c1',installments=3,firstDue='2026-09-28')
add('payments','p2',expense='g4',date='2026-09-12',amount=5000,method='Nakit',card='',installments=1,firstDue='')
add('payments','p3',expense='g2',date='2026-09-10',amount=72000,method='Kredi kartı',card='c2',installments=2,firstDue='2026-09-30')
add('payments','p4',expense='g3',date='2026-09-10',amount=48000,method='Havale',card='',installments=1,firstDue='')
add('statements','s1',card='c1',cutoff='2026-09-18',due='2026-09-28',amount=40000)
add('statements','s2',card='c2',cutoff='2026-09-20',due='2026-09-30',amount=36000)
add('cardPayments','cp1',statement='s1',date='2026-09-22',amount=10000)
for i,event in enumerate(['e1','e2','e3']):
 add('receipts','r'+str(i),event=event,date='2026-09-10',amount=[900000,285000,240000][i],status='Tahsil edildi',method='Havale',note='Avans (örnek)')
 add('receipts','rp'+str(i),event=event,date='2026-09-25',amount=[1260000,855000,144000][i],status='Planlandı',method='Havale',note='Kalan sözleşme tahsilatı (örnek)')
 add('staff','st'+str(i),event=event,name=['Deniz (örnek)','Ece (örnek)','Can (örnek)'][i],role='Operasyon sorumlusu',days=3,rate=2500,due='2026-09-30')
 add('advances','a'+str(i),staff='st'+str(i),date='2026-09-12',amount=2000,method='Havale')
 add('tasks','t'+str(i),event=event,title='Teknik plan ve tedarikçi teyidi',owner=['Deniz','Ece','Can'][i],due='2026-09-20',status='Devam ediyor',priority='Yüksek')
add('extras','x1',event='e1',description='İlave LED ekran',kind='Ek iş',amount=50000,vat=10000,status='Onaylandı')
add('extras','x2',event='e2',description='Ek karşılama bankosu',kind='Ek iş',amount=15000,vat=3000,status='Bekliyor')
add('resources','res1',name='LED ekran seti',capacity=1)
add('allocations','al1',event='e1',resource='res1',start='2026-09-25T08:00',end='2026-09-27T02:00',quantity=1,buffer=480,status='Kesin')
add('allocations','al2',event='e3',resource='res1',start='2026-09-26T08:00',end='2026-09-26T20:00',quantity=1,buffer=120,status='Geçici')
for i,(phase,title,critical) in enumerate([
 ('Mekân keşfi','Ölçüler, yükleme girişi ve çalışma saatlerini teyit et','Kritik'),
 ('Mekân keşfi','Alan yerleşimi ve erişilebilir güzergâhları teyit et','Kritik'),
 ('Kurulum','Araç geliş sırası ve boşaltma saatlerini belirle','Normal'),
 ('Kurulum','Kurulum teslim ve kontrol sorumlusunu belirle','Kritik'),
 ('Teknik sistemler','Elektrik ihtiyacını yetkili teknik ekip ile teyit et','Kritik'),
 ('Teknik sistemler','Ses, ışık, görüntü test ve prova saatlerini teyit et','Kritik'),
 ('Ekip','Vardiya, iletişim ve görev dağılımını paylaşılmaya hazırla','Normal'),
 ('Sanatçı / protokol','Rider, transfer, konaklama ve sahne saatlerini teyit et','Normal'),
 ('Giriş / akreditasyon','Giriş kategorileri, kontrol noktaları ve kuyruk planını teyit et','Kritik'),
 ('İkram','Kişi sayısı, servis saati ve özel ihtiyaçları teyit et','Normal'),
 ('İzin / belge','Etkinliğe uygulanabilir izin ve belge listesini sorumluyla teyit et','Kritik'),
 ('Alternatif plan','Hava, enerji kesintisi ve gecikme için sorumluları belirle','Kritik'),
 ('Alternatif plan','Mekânın acil durum planı ve yetkili iletişimlerini teyit et','Kritik'),
 ('Söküm / iade','Söküm sırası, araç planı ve alan teslimini belirle','Normal'),
 ('Söküm / iade','Ekipman sayım, hasar ve iade kontrolünü planla','Normal')]):
 for event in ['e1','e2','e3']:
  add('operations',event+'-op'+str(i),event=event,phase=phase,title=title,owner='Operasyon ekibi (örnek)',due='2026-09-20',status='Teyit bekliyor' if critical=='Kritik' else 'Başlanmadı',critical=critical,evidence='',note='Örnek kontrol; gerçek etkinlik kapsamına göre düzenleyin')
add('warehouses','w1',name='Ana depo (örnek)',location='A bölümü',owner='Depo ekibi')
add('warehouses','w2',name='Atölye depo (örnek)',location='B bölümü',owner='Atölye ekibi')
add('products','pr1',code='SES-001',name='Aktif hoparlör',category='Ses',unit='Adet',tracking='Adet havuzu',serial='',minimum=2)
add('products','pr2',code='ISIK-001',name='LED spot',category='Işık',unit='Adet',tracking='Adet havuzu',serial='',minimum=4)
add('stockMoves','sm1',product='pr1',warehouse='w1',destination='',date='2026-09-01T09:00',type='Giriş',condition='Kullanılabilir',quantity=10,note='Örnek açılış sayımı')
add('stockMoves','sm2',product='pr2',warehouse='w2',destination='',date='2026-09-01T09:00',type='Giriş',condition='Kullanılabilir',quantity=20,note='Örnek açılış sayımı')
add('rentals','rent1',event='',customer='Örnek Kiracı A',product='pr1',warehouse='w1',quantity=4,start='2026-09-12T08:00',end='2026-09-16T20:00',billDays=4,dailyRate=750,discount=0,vat=2400,incomeMode='Bağımsız gelir',billing='Faturalandı',status='Onaylandı')
add('dispatches','dis1',rental='rent1',date='2026-09-12T08:00',quantity=4,recipient='Örnek teslim alan',reference='ÖRNEK-TESLİM-01')
add('returns','ret1',rental='rent1',warehouse='w1',date='2026-09-13T08:00',quantity=1,condition='Hasarlı',reference='Örnek hasar notu')
add('rentalReceipts','rr1',rental='rent1',date='2026-09-12',kind='Kira tahsilatı',amount=7200,method='Havale',note='Örnek kısmi tahsilat')
add('rentalReceipts','rr2',rental='rent1',date='2026-09-12',kind='Depozito alındı',amount=3000,method='Havale',note='Gelir değildir')
add('rentals','rent2',event='e1',customer='Rota Kültür (örnek)',product='pr1',warehouse='w1',quantity=8,start='2026-09-25T08:00',end='2026-09-27T12:00',billDays=2,dailyRate=750,discount=0,vat=2400,incomeMode='Etkinlik sözleşmesine dahil',billing='Teklif',status='Onaylandı')
(ROOT/'sample.json').write_text(json.dumps({'data':D,'schema':SCHEMA},ensure_ascii=False),encoding='utf-8')
