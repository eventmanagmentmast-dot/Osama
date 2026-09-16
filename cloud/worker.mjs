import assets from './assets.generated.json' with {type:'json'};
import {schema,sensitive,allowed,filtered,validate,validateWarehouse} from './logic.mjs';
import {catalogueTransition} from './catalogue.mjs';
import {invoiceTransition} from './invoice-approval.mjs';
import {portalData} from './portal.mjs';
import {convertQuote,reviseQuote} from './business.mjs';
import businessSchema from '../business-schema.json' with {type:'json'};
import {zipSync,strToU8} from 'fflate';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const id=()=>crypto.randomUUID();
const owner=env=>(env.OWNER_EMAIL||'').trim().toLowerCase();
async function snapshot(db){const rs=await db.batch([db.prepare('SELECT revision FROM state WHERE id=1'),db.prepare('SELECT kind,id,payload FROM records'),db.prepare('SELECT email,role FROM members')]);const data=Object.fromEntries(Object.keys(schema).map(k=>[k,[]]));for(const r of rs[1].results)if(data[r.kind])data[r.kind].push({...JSON.parse(r.payload),id:r.id});return {data,revision:rs[0].results[0]?.revision||0,members:rs[2].results};}
// Every mutation advances one shared revision in the same atomic D1 batch.
// A stale request cannot partially modify records, membership, or audit history.
async function commit(db,revision,actor,action,operations){
 const token=id(),guard='EXISTS(SELECT 1 FROM state WHERE id=1 AND token=?)';
 const statements=[db.prepare('INSERT OR IGNORE INTO state(id,revision,token) VALUES(1,0,\'\')'),db.prepare('UPDATE state SET revision=revision+1,token=? WHERE id=1 AND revision=?').bind(token,revision)];
 for(const op of operations)statements.push(db.prepare(op.sql.replaceAll('$GUARD',guard)).bind(...op.values,token));
 statements.push(db.prepare('INSERT INTO audit(id,at,actor,action) SELECT ?,?,?,? WHERE '+guard).bind(id(),new Date().toISOString(),actor,action,token));
 const result=await db.batch(statements);if(result[1].meta.changes!==1)throw error('Başka bir kullanıcı kayıtları güncelledi. Formdaki bilgilerinizi koruyup paneli yenileyin ve yeniden deneyin.',409);
 return {ok:true,revision:revision+1};
}
const putRecord=(kind,rid,record)=>({sql:'INSERT OR REPLACE INTO records(kind,id,payload) SELECT ?,?,? WHERE $GUARD',values:[kind,rid,JSON.stringify(record)]});
function bytes64(s){if(typeof s!=='string')throw error('Belge verisi geçersiz');let raw;try{raw=atob(s)}catch{throw error('Belge verisi geçersiz')}if(raw.length>10*1024*1024)throw error('Belge en fazla 10 MB olabilir');return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function skyscannerUrl(x){const day=v=>String(v||'').replaceAll('-','').slice(2),back=x.returnDate?day(x.returnDate)+'/':'';return 'https://www.skyscanner.com.tr/transport/flights/'+x.from.toLowerCase()+'/'+x.to.toLowerCase()+'/'+day(x.date)+'/'+back+'?adultsv2='+x.adults+'&cabinclass='+encodeURIComponent(x.cabin)+'&rtn='+(x.returnDate?'1':'0');}
async function searchFlights(env,x){
 const clean={from:String(x.from||'').toUpperCase(),to:String(x.to||'').toUpperCase(),date:String(x.date||''),returnDate:String(x.returnDate||''),adults:Number(x.adults||1),cabin:String(x.cabin||'economy')};
 if(!/^[A-Z]{3}$/.test(clean.from)||!/^[A-Z]{3}$/.test(clean.to)||!/^\d{4}-\d{2}-\d{2}$/.test(clean.date)||clean.returnDate&&!/^\d{4}-\d{2}-\d{2}$/.test(clean.returnDate)||!Number.isInteger(clean.adults)||clean.adults<1||clean.adults>9)throw error('Uçuş arama bilgileri geçersiz');
 const url=skyscannerUrl(clean);if(!env.SKYSCANNER_API_KEY)return {available:false,url,options:[]};
 const leg=(a,b,d)=>{const [year,month,day]=d.split('-').map(Number);return {originPlaceId:{iata:a},destinationPlaceId:{iata:b},date:{year,month,day}}};
 const cabin={economy:'CABIN_CLASS_ECONOMY',premiumeconomy:'CABIN_CLASS_PREMIUM_ECONOMY',business:'CABIN_CLASS_BUSINESS',first:'CABIN_CLASS_FIRST'}[clean.cabin]||'CABIN_CLASS_ECONOMY';
 const queryLegs=[leg(clean.from,clean.to,clean.date)];if(clean.returnDate)queryLegs.push(leg(clean.to,clean.from,clean.returnDate));
 const headers={'x-api-key':env.SKYSCANNER_API_KEY,'Content-Type':'application/json'};
 let response=await fetch('https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/create',{method:'POST',headers,body:JSON.stringify({query:{market:'TR',locale:'tr-TR',currency:'TRY',queryLegs,adults:clean.adults,cabinClass:cabin}})});
 if(!response.ok)throw error('Canlı uçuş sağlayıcısına ulaşılamadı',502);let result=await response.json(),token=result.sessionToken;
 if(token){response=await fetch('https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/poll/'+encodeURIComponent(token),{method:'POST',headers});if(response.ok)result=await response.json();}
 const itineraries=Object.values(result.content?.results?.itineraries||{}),agents=result.content?.results?.agents||{};
 const options=itineraries.flatMap(it=>(it.pricingOptions||[]).map(p=>({price:p.price?.amount||p.price||'',currency:'TRY',deepLink:p.items?.[0]?.deepLink||url,provider:agents[p.items?.[0]?.agentId]?.name||'Skyscanner'}))).filter(x=>x.price).sort((a,b)=>Number(a.price)-Number(b.price)).slice(0,8);
 return {available:true,url,options};
}
async function backup(data,bucket){const files={};let total=0;for(const d of data.documents){const object=await bucket.get(d.storageKey);if(!object)throw error('Yedek için bir belgeye ulaşılamadı',503);const bytes=new Uint8Array(await object.arrayBuffer());total+=bytes.length;if(total>12*1024*1024)throw error('Tek JSON yedeği için belge toplamı 12 MB sınırını aşıyor. Belgeleri ayrı indirin.',413);files[d.id]=base64(bytes);}return {version:1,data:Object.fromEntries(Object.entries(data).map(([k,rs])=>[k,rs.map(({storageKey,...r})=>r)])),files};}
export async function handle(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(!env.DB||!env.BUCKET||!owner(env))throw error('Ortak çalışma alanı henüz yapılandırılmadı.',503);
 const email=(request.headers.get('oai-authenticated-user-email')||'').trim().toLowerCase(),uid=request.headers.get('oai-authenticated-user-id');
 // Identity comes only from the Sites dispatcher. No application public signup.
 if(!uid||!email){if(!path.startsWith('/api/'))return Response.redirect(url.origin+'/signin-with-chatgpt?return_to=%2F',302);throw error('Giriş gerekli',401);}
 const snap=await snapshot(env.DB),role=email===owner(env)?'admin':snap.members.find(m=>m.email===email)?.role;
 if(!role||role==='disabled')throw error('Bu çalışma alanında yetkiniz yok. Yöneticinizden erişim isteyin.',403);
 if(request.method==='GET'){
  if(['/brand-mark.png','/event-scene.png'].includes(path))return new Response(Uint8Array.from(atob(assets[path]),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'}});
  if(Object.hasOwn(assets,path))return new Response(assets[path],{headers:{'Content-Type':(path.endsWith('.js')||path.endsWith('.mjs'))?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
  if(path==='/api/session')return json({setup:false,cloud:true,user:{name:email,role}});
  if(path==='/api/data'&&['customer','field'].includes(role)){const data=portalData(snap.data,email,role);return json({data,revision:snap.revision,schema:Object.fromEntries(Object.keys(data).map(k=>[k,schema[k].filter(([f])=>!sensitive[k]?.includes(f))])),write:[],users:[]});}
  if(['customer','field'].includes(role)){
   const own=portalData(snap.data,email,role),targets=new Set((role==='customer'?own.approvals:own.fieldReports).map(r=>(role==='customer'?'approvals:':'fieldReports:')+r.id).concat(role==='field'?own.invoiceSubmissions.flatMap(r=>['invoiceSubmissions:'+r.id,...(r.expense?['expenses:'+r.expense]:[])]):[])),docs=snap.data.documents.filter(d=>targets.has(d.target));
   if(path==='/api/portal-documents')return json({rows:docs.map(({id,name,target})=>({id,name,target}))});
   if(path.startsWith('/api/file/')){const d=docs.find(d=>d.id===path.split('/').pop());if(!d)throw error('Yetki yok',403);const file=await env.BUCKET.get(d.storageKey);if(!file)throw error('Dosya bulunamadı',404);return new Response(file.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(d.name),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
   throw error('Yetki yok',403);
  }
  if(role==='operations'&&(path==='/api/operational-documents'||path.startsWith('/api/file/'))){
   const docs=snap.data.documents.filter(d=>['dispatches','returns','fieldReports','products'].includes(d.target.split(':')[0]));
   if(path==='/api/operational-documents')return json({rows:docs.map(({id,name,target})=>({id,name,target}))});
   const d=docs.find(d=>d.id===path.split('/').pop());if(!d)throw error('Yetki yok',403);const object=await env.BUCKET.get(d.storageKey);if(!object)throw error('Belge bulunamadı',404);return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(d.name),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(path==='/api/data')return json({data:filtered(snap.data,role),revision:snap.revision,schema:Object.fromEntries(Object.entries(schema).filter(([k])=>allowed(role,k)).map(([k,v])=>[k,v.filter(([f])=>role!=='operations'||!sensitive[k]?.includes(f))])),write:Object.keys(schema).filter(k=>allowed(role,k,true)),users:role==='admin'?[{name:owner(env),role:'admin'},...snap.members.filter(m=>m.email!==owner(env)).map(m=>({name:m.email,role:m.role}))]:[]});
  if(path==='/api/audit'){if(role!=='admin')throw error('Yönetici gerekli',403);return json({rows:(await env.DB.prepare('SELECT at,actor,action FROM audit ORDER BY at DESC LIMIT 200').all()).results});}
  if(path==='/api/backup'){if(role!=='admin')throw error('Yönetici gerekli',403);const r=json(await backup(snap.data,env.BUCKET));r.headers.set('Content-Disposition','attachment; filename="organizasyon-yedek.json"');return r;}
  if(path==='/api/export'){const entries={};for(const [k,rs] of Object.entries(filtered(snap.data,role))){const fields=['id',...schema[k].map(f=>f[0]).filter(f=>role!=='operations'||!sensitive[k]?.includes(f))];const csv=v=>'"'+String(typeof v==='string'&&/^[=+\-@]/.test(v)?"'"+v:v??'').replaceAll('"','""')+'"';entries[k+'.csv']=strToU8('\ufeff'+[fields,...rs.map(r=>fields.map(f=>r[f]))].map(r=>r.map(csv).join(';')).join('\r\n'));}return new Response(zipSync(entries),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="excel-tablolari.zip"','Cache-Control':'no-store'}});}
  if(path.startsWith('/api/file/')){if(!allowed(role,'documents'))throw error('Yetki yok',403);const d=snap.data.documents.find(d=>d.id===path.split('/').pop());if(!d)throw error('Belge bulunamadı',404);const object=await env.BUCKET.get(d.storageKey);if(!object)throw error('Belgeye ulaşılamadı',404);return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(d.name),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
  throw error('Bulunamadı',404);
 }
 if(request.method!=='POST')throw error('Yöntem desteklenmiyor',405);
 if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw error('Kaynak reddedildi',403);
 if(request.headers.get('Content-Type')!=='application/json')throw error('JSON gerekli',415);
 if(Number(request.headers.get('Content-Length')||0)>20*1024*1024)throw error('En fazla 20 MB istek',413);
 const body=await request.text();if(new TextEncoder().encode(body).length>20*1024*1024)throw error('En fazla 20 MB istek',413);
 let x;try{x=JSON.parse(body)}catch{throw error('Geçersiz JSON')}
 if(!x||typeof x!=='object'||Array.isArray(x))throw error('Geçersiz istek');
 if(x.expectedRevision!==snap.revision)throw error('Kayıtlar değişti. Paneli yenileyip tekrar deneyin.',409);
 const ops=[];
 if(path==='/api/flight-search'){
  if(!['admin','operations','finance'].includes(role))throw error('Yetki yok',403);return json(await searchFlights(env,x));
 }else if(path==='/api/catalogue-action'){
  const result=catalogueTransition(snap.data,email,role,x,id(),new Date().toISOString());ops.push(putRecord('catalogueRequests',result.requestId,result.request));if(result.entry)ops.push(putRecord('catalogueEntries',result.entryId,result.entry));
 }else if(path==='/api/invoice-approval'){

  const change=invoiceTransition(snap.data,email,role,x,id(),new Date().toISOString());
  if(x.file){
   if(change.kind!=='submit'||!x.file.name||!/\.(pdf|png|jpe?g|webp)$/i.test(x.file.name)||x.file.name.length>500)throw error('Belge geçersiz');
   const fid=id(),storageKey='documents/'+fid,bytes=bytes64(x.file.data);await env.BUCKET.put(storageKey,bytes);
   ops.push(putRecord('documents',fid,{name:x.file.name.split(/[\\/]/).pop(),target:'invoiceSubmissions:'+change.id,storageKey}));
  }
  if(change.kind==='approve'){
   ops.push(putRecord('expenses',change.expenseId,change.record));
   for(const d of snap.data.documents.filter(d=>d.target==='invoiceSubmissions:'+change.id))ops.push(putRecord('documents',d.id,{...d,target:'expenses:'+change.expenseId}));
  }
  ops.push(putRecord('invoiceSubmissions',change.id,change.submission));
 }else if(path==='/api/field-report'){

  if(role!=='field')throw error('Yetki yok',403);const task=portalData(snap.data,email,role).tasks.find(r=>r.id===x.task);if(!task)throw error('Görev bulunamadı',404);
  ops.push(putRecord('fieldReports',id(),validate('fieldReports',{event:task.event,task:task.id,title:x.title,owner:email,date:new Date().toISOString().slice(0,10),status:'Açık',note:x.note},snap.data)));
 }else if(path==='/api/portal-action'){
  if(!['customer','field'].includes(role))throw error('Yetki yok',403);
  const k=role==='customer'?'approvals':'tasks',r=portalData(snap.data,email,role)[k].find(r=>r.id===x.id);if(!r)throw error('Kayıt bulunamadı',404);
  if(role==='customer'&&r.status!=='Bekliyor')throw error('Bu sürüm için karar zaten kaydedildi');
  if(!(role==='customer'?['Onaylandı','Reddedildi']:['Bekliyor','Tamamlandı']).includes(x.status))throw error('Geçersiz karar');
  if(role==='customer'&&r.quote){const q=snap.data.quotes.find(q=>q.id===r.quote);if(!q||q.event)throw error('Teklif artık onaya açık değil');ops.push(putRecord('quotes',q.id,{...q,status:x.status,approval:email+' · '+new Date().toISOString()+' · '+r.version}));}
  if(role==='customer'&&r.extra){const extra=snap.data.extras.find(e=>e.id===r.extra);if(!extra)throw error('Ek iş bulunamadı');ops.push(putRecord('extras',extra.id,{...extra,status:x.status}));}
  ops.push(putRecord(k,r.id,validate(k,{...r,status:x.status,...(role==='customer'?{note:String(x.note||'')}:{} )},snap.data)));
 }else if(path==='/api/users'){
  if(role!=='admin')throw error('Yönetici gerekli',403);const name=String(x.name||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)||name.length>254||!['admin','finance','operations','field','customer','disabled'].includes(x.role))throw error('Geçerli e-posta ve rol gerekli');if(name===owner(env))throw error('Çalışma alanı sahibinin rolü değiştirilemez');
  ops.push({sql:'INSERT OR REPLACE INTO members(email,role) SELECT ?,? WHERE $GUARD',values:[name,x.role]});
 }else if(['/api/convert-quote','/api/revise-quote'].includes(path)){
  if(!['admin','finance'].includes(role))throw error('Yetki yok',403);
  for(const [k,rid,r] of (path.endsWith("revise-quote")?reviseQuote:convertQuote)(snap.data,x.id,id())){const clean=validate(k,r,snap.data);snap.data[k]=[...snap.data[k].filter(v=>v.id!==rid),{...clean,id:rid}];ops.push(putRecord(k,rid,clean));}
 }else if(path==='/api/record'){
  const k=x.kind;if(!Object.hasOwn(schema,k)||['documents','invoiceSubmissions','catalogueRequests','catalogueEntries'].includes(k)||!allowed(role,k,true))throw error('Bu kaydı değiştirme yetkiniz yok',403);
  const rid=x.id||id();if(typeof rid!=='string'||!/^[\w-]{1,100}$/.test(rid))throw error('Kayıt kimliği geçersiz');
  const existing=snap.data[k].find(r=>r.id===rid);
  if(k==='quotes'&&snap.data.approvals.some(a=>a.quote===rid)||k==='quoteLines'&&snap.data.approvals.some(a=>[existing?.quote,x.record?.quote].includes(a.quote)))throw error('Onaya sunulan teklif kilitli. Yeni revizyon oluşturun.');
  if(k==='quotes'&&existing?.event||k==='quoteLines'&&[existing?.quote,x.record?.quote].some(q=>snap.data.quotes.find(r=>r.id===q)?.event))throw error('Dönüştürülen teklif kilitli. Yeni revizyon oluşturun.');
  if(k==='approvals'&&existing&&existing.status!=='Bekliyor')throw error('Karar verilmiş onay kaydı kilitli. Yeni sürüm için yeni onay kaydı açın.');
  const record={...x.record};if(role==='operations')for(const f of sensitive[k]||[])record[f]=existing?.[f]??(f==='cost'?0:'');
  const clean=validate(k,record,snap.data);snap.data[k]=[...snap.data[k].filter(r=>r.id!==rid),{...clean,id:rid}];validateWarehouse(snap.data);ops.push(putRecord(k,rid,clean));
 }else if(path==='/api/upload'){
  if(!allowed(role,'documents',true)&&!['field','operations'].includes(role))throw error('Yetki yok',403);if(role==='field'&&!portalData(snap.data,email,role).fieldReports.some(r=>x.target==='fieldReports:'+r.id))throw error('Yetki yok',403);const [k,rid]=String(x.target||'').split(':');if(role==='operations'&&!['fieldReports','dispatches','returns','products'].includes(k))throw error('Yetki yok',403);if(!['expenses','payments','receipts','statements','cardPayments','fieldReports','approvals','surveys','dispatches','returns','products'].includes(k)||!snap.data[k].some(r=>r.id===rid))throw error('Bağlanacak kayıt bulunamadı');
  const name=String(x.name||'').split(/[\\/]/).pop();if(!/\.(pdf|png|jpe?g|webp)$/i.test(name)||name.length>500)throw error('PDF veya görsel seçin');const bytes=bytes64(x.data),fid=id(),storageKey='documents/'+fid;
  await env.BUCKET.put(storageKey,bytes);ops.push(putRecord('documents',fid,{name,target:x.target,storageKey}));
 }else if(path==='/api/restore'){
  if(role!=='admin')throw error('Yönetici gerekli',403);for(const k of Object.keys(businessSchema))if(x.data&&!(k in x.data))x.data[k]=[];if(x.version!==1||!x.data||Object.keys(schema).some(k=>!Array.isArray(x.data[k]))||Object.keys(x.data).length!==Object.keys(schema).length)throw error('Yedek biçimi geçersiz');
  const count=Object.values(x.data).reduce((n,rs)=>n+rs.length,0);if(count>1000)throw error('Bu sürümde tek geri yükleme en fazla 1000 kayıt içerir');
  const clean=Object.fromEntries(Object.entries(x.data).map(([k,rs])=>{const ids=new Set();return [k,rs.map(r=>{if(!r||typeof r.id!=='string'||!/^[\w-]{1,100}$/.test(r.id)||ids.has(r.id))throw error('Yedekte kayıt kimliği geçersiz');ids.add(r.id);return {...validate(k,r,x.data),id:r.id};})];}));validateWarehouse(clean);
  const fileIds=Object.keys(x.files||{});if(fileIds.length!==clean.documents.length||clean.documents.some(d=>!Object.hasOwn(x.files||{},d.id)))throw error('Yedekte belge dosyaları eksik');
  const blobs=clean.documents.map(d=>[d,bytes64(x.files[d.id])]);
  const backupKey='backups/before-restore-'+Date.now()+'-'+id()+'.json';await env.BUCKET.put(backupKey,JSON.stringify(await backup(snap.data,env.BUCKET)));
  for(const [d,bytes] of blobs){d.storageKey='documents/'+id();await env.BUCKET.put(d.storageKey,bytes);}
  ops.push({sql:'DELETE FROM records WHERE $GUARD',values:[]});for(const [k,rs] of Object.entries(clean))for(const {id:rid,...r} of rs)ops.push(putRecord(k,rid,r));
 }else throw error('Bulunamadı',404);
 return json(await commit(env.DB,snap.revision,email,path,ops));
}
export default {async fetch(request,env){try{return await handle(request,env)}catch(e){if(!e.status)console.error('Storage request failed',e.name);return json({error:e.status?e.message:'Kayıt servisine ulaşılamadı. Bilgilerinizi koruyup tekrar deneyin.'},e.status||503);}}};
