export function catalogueTransition(data,email,role,x,newId,now){
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
 if(!['admin','finance','operations'].includes(role))fail('Yetki yok',403);
 if(x.action==='request'){
  if(!['Ekle / güncelle','Kaldır'].includes(x.change)||!data.products.some(p=>p.id===x.product))fail('Ürün ve işlem seçin');
  if(data.catalogueRequests.some(r=>r.product===x.product&&r.status==='Onay bekliyor'))fail('Bu ürün için zaten bekleyen talep var');
  return {requestId:newId,request:{product:x.product,change:x.change,status:'Onay bekliyor',owner:email,at:now,reviewer:'',reviewedAt:'',note:''}};
 }
 if(role!=='admin')fail('Katalog değişikliğini yalnız yönetici onaylayabilir',403);
 const r=data.catalogueRequests.find(r=>r.id===x.id);if(!r||r.status!=='Onay bekliyor')fail('Talep artık onay beklemiyor',409);
 if(!['approve','reject'].includes(x.action))fail('Geçersiz işlem');
 if(x.action==='reject'&&(!x.note||typeof x.note!=='string'||x.note.length>500))fail('Ret gerekçesi gerekli');
 const request={...r,status:x.action==='approve'?'Onaylandı':'Reddedildi',reviewer:email,reviewedAt:now,note:x.action==='reject'?x.note:'Onaylandı'};
 if(x.action==='reject')return {requestId:r.id,request};
 const p=data.products.find(p=>p.id===r.product);if(!p)fail('Ürün bulunamadı');
 const existing=data.catalogueEntries.find(e=>e.product===p.id);
 if(r.change==='Kaldır'&&!existing)fail('Bu ürün katalogda yok');
 const photos=data.documents.filter(d=>d.target==='products:'+p.id&&/\.(png|jpe?g|webp)$/i.test(d.name)).slice(0,10).map(d=>d.id).join(',');
 const entry=r.change==='Kaldır'?{...existing,status:'Kaldırıldı',approvedBy:email,approvedAt:now}:{product:p.id,name:p.name,code:p.code,brand:p.brand||'',model:p.model||'',category:p.category,description:p.technicalNote||'',dimensions:p.dimensions||'',accessories:p.accessories||'',photoIds:photos,status:'Yayında',approvedBy:email,approvedAt:now};
 return {requestId:r.id,request,entryId:p.id,entry};
}
