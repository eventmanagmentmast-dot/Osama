import assets from './assets.generated.json' with {type:'json'};
import {schema,sensitive,allowed,filtered,validate,validateWarehouse} from './logic.mjs';
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
  if(Object.hasOwn(assets,path))return new Response(assets[path],{headers:{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
  if(path==='/api/session')return json({setup:false,cloud:true,user:{name:email,role}});
  if(path==='/api/data')return json({data:filtered(snap.data,role),revision:snap.revision,schema:Object.fromEntries(Object.entries(schema).filter(([k])=>allowed(role,k)).map(([k,v])=>[k,v.filter(([f])=>role!=='operations'||!sensitive[k]?.includes(f))])),write:Object.keys(schema).filter(k=>allowed(role,k,true)),users:role==='admin'?[{name:owner(env),role:'admin'},...snap.members.filter(m=>m.email!==owner(env)).map(m=>({name:m.email,role:m.role}))]:[]});
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
 if(path==='/api/users'){
  if(role!=='admin')throw error('Yönetici gerekli',403);const name=String(x.name||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)||name.length>254||!['admin','finance','operations','disabled'].includes(x.role))throw error('Geçerli e-posta ve rol gerekli');if(name===owner(env))throw error('Çalışma alanı sahibinin rolü değiştirilemez');
  ops.push({sql:'INSERT OR REPLACE INTO members(email,role) SELECT ?,? WHERE $GUARD',values:[name,x.role]});
 }else if(path==='/api/record'){
  const k=x.kind;if(!Object.hasOwn(schema,k)||k==='documents'||!allowed(role,k,true))throw error('Bu kaydı değiştirme yetkiniz yok',403);
  const rid=x.id||id();if(typeof rid!=='string'||!/^[\w-]{1,100}$/.test(rid))throw error('Kayıt kimliği geçersiz');
  const clean=validate(k,x.record,snap.data);snap.data[k]=[...snap.data[k].filter(r=>r.id!==rid),{...clean,id:rid}];validateWarehouse(snap.data);ops.push(putRecord(k,rid,clean));
 }else if(path==='/api/upload'){
  if(!allowed(role,'documents',true))throw error('Yetki yok',403);const [k,rid]=String(x.target||'').split(':');if(!['expenses','payments','receipts','statements','cardPayments'].includes(k)||!snap.data[k].some(r=>r.id===rid))throw error('Bağlanacak kayıt bulunamadı');
  const name=String(x.name||'').split(/[\\/]/).pop();if(!/\.(pdf|png|jpe?g|webp)$/i.test(name)||name.length>500)throw error('PDF veya görsel seçin');const bytes=bytes64(x.data),fid=id(),storageKey='documents/'+fid;
  await env.BUCKET.put(storageKey,bytes);ops.push(putRecord('documents',fid,{name,target:x.target,storageKey}));
 }else if(path==='/api/restore'){
  if(role!=='admin')throw error('Yönetici gerekli',403);if(x.version!==1||!x.data||Object.keys(schema).some(k=>!Array.isArray(x.data[k]))||Object.keys(x.data).length!==Object.keys(schema).length)throw error('Yedek biçimi geçersiz');
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
