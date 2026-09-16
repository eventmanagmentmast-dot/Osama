import {validate} from './logic.mjs';
import {portalData} from './portal.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function invoiceTransition(data,email,role,x,newId,now){
 const reviewer=['admin','finance'].includes(role);
 if(!reviewer&&role!=='field')fail('Yetki yok',403);
 const old=x.id?data.invoiceSubmissions.find(r=>r.id===x.id):null;
 if(x.id&&!old)fail('Başvuru bulunamadı',404);
 if(x.action==='submit'){
  if(old&&(old.owner!==email||old.status!=='Düzeltme istendi'))fail('Bu kayıt yeniden gönderilemez',403);
  const record=validate('expenses',x.record,data);
  if(role==='field'&&!portalData(data,email,role).events.some(e=>e.id===record.event))fail('Yalnız size atanmış iş için fatura gönderebilirsiniz',403);
  return {kind:'submit',id:old?.id||newId,submission:{...record,owner:email,status:'Onay bekliyor',submittedAt:now,reviewer:'',reviewedAt:'',reviewNote:'',expense:''}};
 }
 if(!reviewer)fail('Yalnız yönetici veya muhasebe onaylayabilir',403);
 if(!old||old.status!=='Onay bekliyor')fail('Bu kayıt artık onay beklemiyor',409);
 if(x.action==='return'){
  if(typeof x.note!=='string'||!x.note.trim()||x.note.length>500)fail('Düzeltme gerekçesi gerekli');
  return {kind:'return',id:old.id,submission:{...old,status:'Düzeltme istendi',reviewer:email,reviewedAt:now,reviewNote:x.note.trim()}};
 }
 if(x.action!=='approve')fail('Geçersiz işlem');
 const record=validate('expenses',x.record,data);
 if(record.number&&data.expenses.some(r=>r.number===record.number&&r.vendor.toLocaleLowerCase('tr')===record.vendor.toLocaleLowerCase('tr')))fail('Bu tedarikçinin aynı numaralı faturası zaten kayıtlı');
 return {kind:'approve',id:old.id,expenseId:newId,record,submission:{...old,...record,status:'Onaylandı',reviewer:email,reviewedAt:now,reviewNote:'Kontrol edilerek onaylandı',expense:newId}};
}
