const demoApp=app;
api=async()=>{throw Error('Açık demo: sunucuya kayıt gönderilmez.');};
app=function(){demoApp();$('#exit').textContent='Demoyu sıfırla';$('#exit').onclick=()=>location.reload();$('#mode').textContent='AÇIK DEMO · Tamamı örnek veri · Değişiklikler yenilemede silinir';};
start=async function(){try{const x=await fetch('./sample.json').then(r=>{if(!r.ok)throw Error('Örnekler yüklenemedi');return r.json()});D=x.data;schema=x.schema;writable=Object.keys(schema).filter(k=>k!=='documents');user={name:'Demo ziyaretçisi',role:'admin'};demo=true;app();}catch(e){notice(e.message)}};
start();
