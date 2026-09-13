import schema from './schema.json' with {type:'json'};
export {schema};
const finance=new Set(['expenses','payments','receipts','cards','statements','cardPayments','staff','advances','extras','rentals','rentalReceipts','products','warehouses','events','documents','dispatches','returns','stockMoves']);
const ops=new Set(['events','resources','allocations','tasks','operations','warehouses','products','stockMoves','rentals','dispatches','returns']);
export const sensitive={events:['revenue','budget','vat'],rentals:['dailyRate','discount','vat','billing','incomeMode','billDays']};
export const allowed=(role,kind,write=false)=>role==='admin'||role==='finance'&&finance.has(kind)&&(!write||!['dispatches','returns','stockMoves'].includes(kind))||role==='operations'&&ops.has(kind)&&(!write||!['events','rentals'].includes(kind));
export function filtered(data,role){return Object.fromEntries(Object.entries(data).filter(([k])=>allowed(role,k)).map(([k,rs])=>[k,rs.map(r=>Object.fromEntries(Object.entries(r).filter(([f])=>role!=='operations'||!sensitive[k]?.includes(f))))]));}
const fail=m=>{throw Object.assign(new Error(m),{status:400})};
function validDate(v,time=false){if(!new RegExp(time?'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?$':'^\\d{4}-\\d{2}-\\d{2}$').test(v))return false;const d=new Date(time?v+'Z':v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,time?16:10)===v.slice(0,time?16:10);}
export function validate(kind,x,data){
 if(!schema[kind]||!x||typeof x!=='object'||Array.isArray(x))fail('Kayıt geçersiz');const clean={};
 for(const [key,label,t] of schema[kind]){let v=x[key]??'';
  if(['money','integer','nonnegative'].includes(t)){if(typeof v==='boolean'||v===''||!['string','number'].includes(typeof v))fail(label+' geçersiz');v=Number(v);if(!Number.isFinite(v)||v<0||v>1e12||(t!=='money'&&!Number.isInteger(v))||(t==='integer'&&v<1))fail(label+' geçersiz');v=t==='money'?Math.round(v*100)/100:v;}
  else{if(typeof v!=='string'||v.length>500)fail(label+' geçersiz');v=v.trim();if(!v&&!['optional','optionaldate'].includes(t)&&!t.startsWith('optref:'))fail(label+' gerekli');if(['date','optionaldate','datetime'].includes(t)&&v&&!validDate(v,t==='datetime'))fail(label+' geçersiz');if(t==='last4'&&!/^\d{4}$/.test(v))fail('Kartın yalnızca son dört hanesi gerekli');if(t.startsWith('enum:')&&!t.slice(5).split(',').includes(v))fail(label+' geçersiz');if(t.includes('ref:')&&v&&!data[t.split(':')[1]]?.some(r=>r.id===v))fail(label+' bulunamadı');}
  clean[key]=v;
 }
 if(kind==='allocations'&&clean.end<=clean.start)fail('Bitiş başlangıçtan sonra olmalı');
 if(kind==='payments'){if(clean.method==='Kredi kartı'&&(!clean.card||!clean.firstDue))fail('Kart ve ilk taksit vadesi gerekli');if(clean.method!=='Kredi kartı')Object.assign(clean,{card:'',installments:1,firstDue:''});if(clean.installments>60)fail('En fazla 60 taksit');}
 if(kind==='statements'&&clean.due<clean.cutoff)fail('Vade hesap kesiminden önce olamaz');
 if(kind==='operations'&&clean.status==='Tamamlandı'&&!clean.evidence)fail('Tamamlanan kontrol için teyit gerekli');
 return clean;
}
export function validateWarehouse(data){
 const rows=k=>data[k]||[],total=(rs,f)=>rs.reduce((s,x)=>s+f(x),0),products=Object.fromEntries(rows('products').map(p=>[p.id,p]));
 const codes=rows('products').map(p=>p.code.toLocaleLowerCase('tr-TR'));if(new Set(codes).size!==codes.length)fail('Ürün kodu benzersiz olmalı');
 for(const p of rows('products'))if(p.tracking==='Tekil varlık'&&!p.serial)fail('Tekil varlık için seri numarası gerekli');
 const events=[];
 for(const m of rows('stockMoves')){if(m.type==='Transfer'&&(!m.destination||m.destination===m.warehouse))fail('Transfer için farklı hedef depo gerekli');events.push([m.date,0,m.warehouse,m.product,m.condition,m.quantity*(m.type==='Giriş'?1:-1)]);if(m.type==='Transfer')events.push([m.date,1,m.destination,m.product,m.condition,m.quantity]);}
 const ordered=(a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]-b[1];
 for(const r of rows('rentals')){
  if(r.end<=r.start)fail('İade zamanı başlangıçtan sonra olmalı');if(r.discount>r.quantity*r.billDays*r.dailyRate)fail('İndirim kira bedelini aşamaz');if(r.incomeMode==='Etkinlik sözleşmesine dahil'&&!r.event)fail('Etkinlik seçin');if(products[r.product]?.tracking==='Tekil varlık'&&r.quantity!==1)fail('Tekil varlık miktarı 1 olmalı');
  const ds=rows('dispatches').filter(d=>d.rental===r.id),rs=rows('returns').filter(d=>d.rental===r.id),progress=[];
  if(ds.length&&r.status!=='Onaylandı')fail('Teslimi olan kiralama onaylı kalmalı');if(total(ds,d=>d.quantity)>r.quantity)fail('Teslim miktarı kiralama miktarını aşamaz');
  for(const d of ds){events.push([d.date,2,r.warehouse,r.product,'Kullanılabilir',-d.quantity]);progress.push([d.date,0,d.quantity]);}
  for(const t of rs){progress.push([t.date,1,-t.quantity]);if(t.condition!=='Kayıp')events.push([t.date,3,t.warehouse,r.product,t.condition==='Hasarlı'?'Hasarlı':'Kullanılabilir',t.quantity]);}
  let remaining=0;for(const p of progress.sort(ordered)){remaining+=p[2];if(remaining<0)fail('İade/kayıp toplamı teslim edileni aşamaz');}
  let deposit=0;for(const t of rows('rentalReceipts').filter(t=>t.rental===r.id).sort((a,b)=>ordered([a.date,a.kind==='Depozito alındı'?0:1],[b.date,b.kind==='Depozito alındı'?0:1]))){if(t.kind==='Depozito alındı')deposit+=t.amount;if(t.kind==='Depozito iade edildi')deposit-=t.amount;if(deposit<0)fail('İade edilen depozito alınanı aşamaz');}
 }
 const balances=new Map();for(const [,,w,p,c,q] of events.sort(ordered)){const key=JSON.stringify([w,p,c]),n=(balances.get(key)||0)+q;balances.set(key,n);if(n<0)fail('Stok yetersiz: '+(products[p]?.name||p)+' / '+c);}
 for(const p of rows('products'))if(p.tracking==='Tekil varlık'){const physical=total([...balances],([key,q])=>JSON.parse(key)[1]===p.id?q:0),outside=total(rows('rentals').filter(r=>r.product===p.id),r=>total(rows('dispatches').filter(d=>d.rental===r.id),d=>d.quantity)-total(rows('returns').filter(t=>t.rental===r.id),t=>t.quantity));if(physical+outside>1)fail('Tekil varlık toplam stok 1 adedi aşamaz');}
}
