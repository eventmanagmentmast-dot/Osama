export function validateBusiness(k,r){
 const fail=m=>{throw Object.assign(Error(m),{status:400})};
 if(k==='quotes'&&r.status==='Onaylandı'&&!r.approval)fail('Onay referansı gerekli');
 if(k==='quoteLines'&&(r.vatRate>100||r.category==='Kiralama'&&(!r.product||!r.warehouse)))fail('KDV oranı veya kiralama ürün/depo bilgisi geçersiz');
 if(k==='externalRentals'&&r.end<=r.start)fail('İade teslimden sonra olmalı');
 if(k==='maintenance'&&r.status==='Tamamlandı'&&!r.reference)fail('Servis belgesi / not gerekli');
 if(k==='approvals'&&!r.event&&!r.quote)fail('Etkinlik veya teklif seçin');
}
export function convertQuote(data,qid,eid){
 const q=data.quotes.find(r=>r.id===qid),fail=m=>{throw Object.assign(Error(m),{status:400})};
 if(!q||q.status!=='Onaylandı')fail('Önce teklifi onaylayın');if(q.event)fail('Teklif zaten etkinliğe dönüştürüldü');
 if(data.quotes.some(r=>r.opportunity===q.opportunity&&r.event))fail('Bu iş fırsatının etkinliği var. Değişiklikleri ek iş olarak kaydedin.');
 const lines=data.quoteLines.filter(r=>r.quote===qid);if(!lines.length)fail('Teklif kalemi ekleyin');
 const o=data.opportunities.find(r=>r.id===q.opportunity),c=data.customers.find(r=>r.id===o.customer),round=n=>Math.round(n*100)/100,total=f=>round(lines.reduce((n,r)=>n+f(r),0));
 const rentals=lines.filter(r=>r.category==='Kiralama').map((r,i)=>{const end=new Date(o.date+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+r.days);return ['rentals',eid+'-r'+i,{event:eid,customer:c.name,product:r.product,warehouse:r.warehouse,quantity:r.quantity,start:o.date+'T08:00',end:end.toISOString().slice(0,10)+'T08:00',billDays:r.days,dailyRate:r.price,discount:0,vat:round(r.quantity*r.days*r.price*r.vatRate/100),incomeMode:'Etkinlik sözleşmesine dahil',billing:'Teklif',status:'Taslak'}]});
 return [['events',eid,{name:q.title,client:c.name,date:o.date,venue:o.venue,revenue:total(r=>round(r.quantity*r.days*r.price)),vat:total(r=>round(r.quantity*r.days*r.price*r.vatRate/100)),budget:total(r=>r.quantity*r.days*r.cost)}],['quotes',qid,{...q,event:eid}],['opportunities',o.id,{...o,stage:'Kazanıldı'}],['tasks',eid+'-prep',{event:eid,title:'Teklif kapsamını ve ekipman rezervasyonlarını teyit et',owner:o.owner,due:o.date,status:'Bekliyor',priority:'Yüksek'}],...rentals];
}
export function reviseQuote(data,qid,id){const q=data.quotes.find(r=>r.id===qid);if(!q)throw Object.assign(Error('Teklif bulunamadı'),{status:404});return [['quotes',id,{...q,status:'Taslak',approval:'',event:'',revision:Math.max(...data.quotes.filter(r=>r.opportunity===q.opportunity).map(r=>r.revision))+1}],...data.quoteLines.filter(r=>r.quote===qid).map((r,i)=>['quoteLines',id+'-l'+i,{...r,quote:id}])];}
