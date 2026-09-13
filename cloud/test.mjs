import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.mjs';
import {validateWarehouse} from './logic.mjs';
const sample=JSON.parse(readFileSync('sample.json','utf8')).data;
function environment(){const db=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')))db.exec(readFileSync('drizzle/'+f,'utf8'));const objects=new Map();return {OWNER_EMAIL:'owner@example.test',DB:{prepare(sql){return {sql,values:[],bind(...values){return {...this,values}}}},async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>{const p=db.prepare(s.sql);if(/^SELECT/.test(s.sql))return {results:p.all(...s.values),meta:{changes:0}};const r=p.run(...s.values);return {results:[],meta:{changes:Number(r.changes)}};});db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e}}},BUCKET:{async put(k,b){objects.set(k,typeof b==='string'?new TextEncoder().encode(b):b)},async get(k){const b=objects.get(k);return b?{body:b,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}:null}},db,objects};}
async function req(env,path,body,email='owner@example.test',headers={}){const r=await worker.fetch(new Request('https://example.test/api/'+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':'test-id','oai-authenticated-user-email':email,...(body?{'Origin':'https://example.test','Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined}),env);return {status:r.status,data:r.headers.get('Content-Type')?.includes('json')?await r.json():new Uint8Array(await r.arrayBuffer())};}
test('shared storage, authentication, role boundaries, conflicts, stock checks and backup restore',async()=>{
 const env=environment();let revision=0;
 assert.equal((await req(env,'data',null,'')).status,401);
 assert.equal((await req(env,'data',null,'outsider@example.test')).status,403);
 const save=async(path,body)=>{const r=await req(env,path,{...body,expectedRevision:revision});assert.equal(r.status,200,JSON.stringify(r.data));revision=r.data.revision;return r;};
 for(const kind of ['events','cards','expenses','payments','receipts','statements','cardPayments','staff','advances','extras','resources','allocations','tasks','operations','warehouses','products','stockMoves','rentals','dispatches','returns','rentalReceipts'])for(const r of sample[kind])await save('record',{kind,id:r.id,record:r});
 assert.equal((await req(env,'data')).data.data.events[0].name,sample.events[0].name);
 assert.equal((await req(env,'record',{kind:'events',record:sample.events[0],expectedRevision:0})).status,409);
 assert.equal((await req(env,'record',{kind:'events',record:sample.events[0],expectedRevision:revision},'owner@example.test',{Origin:'https://attacker.test'})).status,403);
 await save('users',{name:'ops@example.test',role:'operations'});
 const view=(await req(env,'data',null,'ops@example.test')).data;
 assert.equal(view.data.expenses,undefined);assert.equal(view.data.events[0].revenue,undefined);assert.equal(view.data.rentals[0].dailyRate,undefined);
 assert.equal((await req(env,'backup',null,'ops@example.test')).status,403);
 assert.equal((await req(env,'record',{kind:'expenses',record:sample.expenses[0],expectedRevision:revision},'ops@example.test')).status,403);
 assert.equal((await req(env,'record',{kind:'dispatches',record:{...sample.dispatches[0],quantity:999},expectedRevision:revision})).status,400);
 assert.equal((await req(env,'record',{kind:'returns',record:{...sample.returns[0],quantity:999},expectedRevision:revision})).status,400);
 await save('upload',{target:'expenses:'+sample.expenses[0].id,name:'test.pdf',data:btoa('%PDF-1.4 test')});
 const b=(await req(env,'backup')).data;assert.equal(b.data.documents.length,1);assert.equal(Object.keys(b.files).length,1);
 await save('restore',b);const restored=(await req(env,'data')).data;assert.equal(restored.data.events.length,sample.events.length);assert.ok([...env.objects.keys()].some(k=>k.startsWith('backups/')));
 assert.equal((await req(env,'file/'+restored.data.documents[0].id)).status,200);
 assert.equal((await req(env,'export')).status,200);
 await save('users',{name:'ops@example.test',role:'disabled'});assert.equal((await req(env,'data',null,'ops@example.test')).status,403);
 // Two clients reading the same revision: exactly one mutation may win.
 const sameRevision=revision;
 const outcomes=await Promise.all([req(env,'record',{kind:'events',record:sample.events[0],expectedRevision:sameRevision}),req(env,'record',{kind:'events',record:sample.events[0],expectedRevision:sameRevision})]);
 assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
 env.db.close();
});
test('stock timeline rejects returning equipment before it was dispatched',()=>{const d=structuredClone(sample);d.returns[0].date='2000-01-01T00:00';assert.throws(()=>validateWarehouse(d),/İade/);});
