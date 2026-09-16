import json
from datetime import date,timedelta
from pathlib import Path
SCHEMA=json.loads((Path(__file__).parent/'business-schema.json').read_text(encoding='utf-8'))
FINANCE={'catalogueRequests','catalogueEntries','invoiceSubmissions','taxScenarios','customers','opportunities','quotes','quoteLines','externalRentals','contractors','maintenance','investments','approvals','transportServices'}
OPS={'catalogueRequests','catalogueEntries','fieldReports','externalRentals','maintenance','eventEntrances','attendees','attendeeCheckIns','attendeeFlights','transportServices','passengerTransfers'}

def validate(kind,r):
 if kind=='partners' and r['share']>100:raise ValueError('Ortaklık payı %100 üzerinde olamaz')
 if kind=='partnerProfitPools' and (not r['year'].isdigit() or not 2000<=int(r['year'])<=2100):raise ValueError('Geçerli yıl girin')
 if kind in {'expenses','invoiceSubmissions'} and r.get('invoiceType') and r['invoiceType'] not in {'Belirlenmedi','e-Fatura','e-Arşiv Fatura','Diğer / kâğıt fatura'}:raise ValueError('Fatura türü geçersiz')
 if kind=='taxScenarios' and (r['rate']>100 or r['withholdingRate']>100):raise ValueError('Oran en fazla %100 olabilir')
 if kind=='quotes' and r['status']=='Onaylandı' and not r['approval']:raise ValueError('Onay referansı gerekli')
 if kind=='approvals' and not r['event'] and not r['quote']:raise ValueError('Etkinlik veya teklif seçin')
 if kind=='quoteLines':
  if r['vatRate']>100:raise ValueError('KDV oranı 0–100 olmalı')
  if r['category']=='Kiralama' and (not r['product'] or not r['warehouse']):raise ValueError('Kiralama için ürün ve depo gerekli')
 if kind=='externalRentals' and r['end']<=r['start']:raise ValueError('İade teslimden sonra olmalı')
 if kind=='maintenance' and r['status']=='Tamamlandı' and not r['reference']:raise ValueError('Servis belgesi / not gerekli')
 if kind=='attendees' and not r['qrToken'].startswith('OSAMA-LCV-'):raise ValueError('Misafir QR kodu geçersiz')
 if kind=='attendeeFlights' and (len(r['originIata'])!=3 or len(r['destinationIata'])!=3):raise ValueError('Havalimanı için üç harfli IATA kodu girin')

def convert(data,qid,event_id):
 q=next((r for r in data['quotes'] if r['id']==qid),None)
 if not q or q['status']!='Onaylandı':raise ValueError('Önce teklifi onaylayın')
 if q['event']:raise ValueError('Teklif zaten etkinliğe dönüştürüldü')
 if any(r['opportunity']==q['opportunity'] and r['event'] for r in data['quotes']):raise ValueError('Bu iş fırsatının etkinliği var. Değişiklikleri ek iş olarak kaydedin.')
 lines=[r for r in data['quoteLines'] if r['quote']==qid]
 if not lines:raise ValueError('Teklif kalemi ekleyin')
 o=next(r for r in data['opportunities'] if r['id']==q['opportunity'])
 customer=next(r for r in data['customers'] if r['id']==o['customer'])
 net=sum(round(r['quantity']*r['days']*r['price'],2) for r in lines)
 vat=sum(round(r['quantity']*r['days']*r['price']*r['vatRate']/100,2) for r in lines)
 event=dict(name=q['title'],client=customer['name'],date=o['date'],venue=o['venue'],revenue=round(net,2),vat=round(vat,2),budget=round(sum(r['quantity']*r['days']*r['cost'] for r in lines),2))
 rentals=[('rentals',event_id+'-r'+str(i),dict(event=event_id,customer=customer['name'],product=r['product'],warehouse=r['warehouse'],quantity=r['quantity'],start=o['date']+'T08:00',end=(date.fromisoformat(o['date'])+timedelta(days=r['days'])).isoformat()+'T08:00',billDays=r['days'],dailyRate=r['price'],discount=0,vat=round(r['quantity']*r['days']*r['price']*r['vatRate']/100,2),incomeMode='Etkinlik sözleşmesine dahil',billing='Teklif',status='Taslak')) for i,r in enumerate(lines) if r['category']=='Kiralama']
 return [('events',event_id,event),('quotes',qid,{**{k:v for k,v in q.items() if k!='id'},'event':event_id}),('opportunities',o['id'],{**{k:v for k,v in o.items() if k!='id'},'stage':'Kazanıldı'}),('tasks',event_id+'-prep',dict(event=event_id,title='Teklif kapsamını ve ekipman rezervasyonlarını teyit et',owner=o['owner'],due=o['date'],status='Bekliyor',priority='Yüksek'))]+rentals

def revise(data,qid,new_id):
 q=next((r for r in data['quotes'] if r['id']==qid),None)
 if not q:raise ValueError('Teklif bulunamadı')
 revision=max(r['revision'] for r in data['quotes'] if r['opportunity']==q['opportunity'])+1
 return [('quotes',new_id,{**q,'status':'Taslak','event':'','approval':'','revision':revision})]+[('quoteLines',new_id+'-l'+str(i),{**r,'quote':new_id}) for i,r in enumerate(data['quoteLines']) if r['quote']==qid]
