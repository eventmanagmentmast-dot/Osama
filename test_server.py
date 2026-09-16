import tempfile,threading,json,urllib.request,urllib.error,http.cookiejar,base64,sqlite3
from pathlib import Path
import server
tmp=tempfile.TemporaryDirectory();server.DB=Path(tmp.name)/'test.sqlite3';server.ROOT=Path(tmp.name)
server.initialize();service=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);threading.Thread(target=service.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(service.server_port)
def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def req(c,path,data=None):
 r=urllib.request.Request(base+'/api/'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
 try:
  with c.open(r) as f:return f.status,json.loads(f.read())
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
a=client();assert req(a,'data')[0]==401
assert req(a,'setup',{'name':'test-admin','password':'test-only-password'})[0]==200
source=json.loads((Path(__file__).parent/'sample.json').read_text(encoding='utf-8'))['data']
for kind in ['events','cards','expenses','payments','receipts','statements','cardPayments','staff','advances','extras','resources','allocations','tasks','operations','warehouses','products','stockMoves','rentals','dispatches','returns','rentalReceipts','documents']:
 rows=source[kind]
 if kind=='documents':continue
 for r in rows:
  status,result=req(a,'record',{'kind':kind,'id':r['id'],'record':r});assert status==200,(kind,result)
assert req(a,'users',{'name':'test-ops','password':'test-only-password','role':'operations'})[0]==200
o=client();assert req(o,'login',{'name':'test-ops','password':'test-only-password'})[0]==200
view=req(o,'data')[1];assert 'expenses' not in view['data'];assert 'revenue' not in view['data']['events'][0]
assert req(o,'record',{'kind':'expenses','record':source['expenses'][0]})[0]==403
assert req(o,'backup')[0]==403
invoice=dict(source['expenses'][0],number='LOCAL-APPROVAL',invoiceType='e-Arşiv Fatura')
assert req(a,'invoice-approval',{'action':'submit','record':invoice})[0]==200
pending=req(a,'data')[1]['data']['invoiceSubmissions'][0]
assert pending['status']=='Onay bekliyor'
assert req(o,'invoice-approval',{'action':'approve','id':pending['id'],'record':invoice})[0]==400
assert req(a,'invoice-approval',{'action':'approve','id':pending['id'],'record':invoice})[0]==200
assert req(a,'invoice-approval',{'action':'approve','id':pending['id'],'record':invoice})[0]==400
assert req(a,'record',{'kind':'payments','record':dict(source['payments'][0],amount=-1)})[0]==400
assert req(a,'record',{'kind':'payments','record':dict(source['payments'][0],card='')})[0]==400
assert req(a,'upload',{'target':'expenses:g0','name':'test.pdf','data':base64.b64encode(b'%PDF-1.4 demo').decode()})[0]==200
assert req(a,'record',{'kind':'dispatches','record':dict(source['dispatches'][0],quantity=20)})[0]==400
assert req(a,'record',{'kind':'returns','record':dict(source['returns'][0],quantity=10)})[0]==400
assert 'dailyRate' not in req(o,'data')[1]['data']['rentals'][0]
backup=req(a,'backup')[1];assert len(backup['data']['documents'])==1 and len(backup['files'])==1
assert req(a,'restore',backup)[0]==200
assert req(a,'data')[1]['data']['payments'][0]['amount']==120000
assert len(req(a,'data')[1]['data']['documents'])==1
service.shutdown();tmp.cleanup();print('PASS: login, record validation, operations restrictions, document backup and restore, data preservation')



