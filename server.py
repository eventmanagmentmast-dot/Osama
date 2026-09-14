import os,json,sqlite3,secrets,hashlib,hmac,time,base64,io,csv,zipfile,threading
import warehouse,business
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parent
DB=Path(os.environ.get('ORG_DB',str(ROOT/'records.sqlite3')))
LOCK=threading.RLock()
SCHEMA={
'events':[('name','Etkinlik','text'),('client','Müşteri','text'),('date','Etkinlik tarihi','date'),('venue','Mekân','text'),('revenue','Sözleşme net TL','money'),('budget','Maliyet bütçesi net TL','money'),('vat','Sözleşme KDV tutarı TL','money')],
'expenses':[('event','Etkinlik','ref:events'),('vendor','Tedarikçi','text'),('description','Gider açıklaması','text'),('net','Net gider TL','money'),('vat','Kayıtlı KDV TL','money'),('document','Belge durumu','enum:Faturalı,Faturasız,Belge bekleniyor'),('number','Belge numarası / not','optional'),('due','Ödeme vadesi','date')],
'payments':[('expense','Gider kaydı','ref:expenses'),('date','Ödeme tarihi','date'),('amount','Ödeme TL (KDV dahil)','money'),('method','Yöntem','enum:Havale,Nakit,Kredi kartı'),('card','Kart (kartlı işlemde)','optref:cards'),('installments','Taksit sayısı','integer'),('firstDue','İlk taksit vadesi (kartlı işlemde)','optionaldate')],
'receipts':[('event','Etkinlik','ref:events'),('date','Tarih / vade','date'),('amount','Tahsilat TL (KDV dahil)','money'),('status','Durum','enum:Planlandı,Tahsil edildi'),('method','Yöntem','enum:Havale,Nakit,POS'),('note','Açıklama','optional')],
'cards':[('name','Kart adı / banka','text'),('last4','Son dört hane','last4'),('limit','Kart limiti TL','money')],
'statements':[('card','Kart','ref:cards'),('cutoff','Hesap kesim tarihi','date'),('due','Son ödeme tarihi','date'),('amount','Banka ekstresi dönem borcu TL','money')],
'cardPayments':[('statement','Ekstre','ref:statements'),('date','Bankaya ödeme tarihi','date'),('amount','Ödenen TL','money')],
'staff':[('event','Etkinlik','ref:events'),('name','Personel','text'),('role','Görev','text'),('days','Çalışma günü','integer'),('rate','Günlük ücret TL','money'),('due','Ödeme vadesi','date')],
'advances':[('staff','Personel kaydı','ref:staff'),('date','Ödeme tarihi','date'),('amount','Avans / ücret ödemesi TL','money'),('method','Yöntem','enum:Nakit,Havale')],
'extras':[('event','Etkinlik','ref:events'),('description','Ek iş / iade açıklaması','text'),('kind','Tür','enum:Ek iş,Müşteri iadesi'),('amount','Net tutar TL','money'),('vat','KDV tutarı TL','money'),('status','Onay','enum:Bekliyor,Onaylandı,Reddedildi')],
'resources':[('name','Ekipman / ekip / araç','text'),('capacity','Aynı anda kullanılabilir adet','integer')],
'allocations':[('event','Etkinlik','ref:events'),('resource','Kaynak','ref:resources'),('start','Başlangıç (Türkiye saati)','datetime'),('end','Bitiş (Türkiye saati)','datetime'),('quantity','Ayrılan adet','integer'),('buffer','Seyahat / hazırlık tamponu dakika','nonnegative'),('status','Rezervasyon','enum:Kesin,Geçici')],
'tasks':[('event','Etkinlik','ref:events'),('title','İş / görev','text'),('owner','Sorumlu','text'),('due','Son tarih','date'),('status','Durum','enum:Bekliyor,Devam ediyor,Tamamlandı'),('priority','Öncelik','enum:Yüksek,Normal,Düşük')],
'operations':[('event','Etkinlik','ref:events'),('phase','Hazırlık başlığı','enum:Mekân keşfi,Kurulum,Teknik sistemler,Ekip,Sanatçı / protokol,Giriş / akreditasyon,İkram,İzin / belge,Alternatif plan,Söküm / iade'),('title','Kontrol / yapılacak iş','text'),('owner','Sorumlu kişi / ekip','text'),('due','Son tarih','date'),('status','Durum','enum:Başlanmadı,Devam ediyor,Teyit bekliyor,Tamamlandı,Uygulanmıyor'),('critical','Önem','enum:Kritik,Normal'),('evidence','Teyit / belge referansı','optional'),('note','Eksik / açıklama','optional')],
'documents':[('target','Bağlı kayıt','text'),('name','Dosya adı','text')]
}
SCHEMA.update(warehouse.SCHEMA)
SCHEMA.update(business.SCHEMA)
FINANCE={'expenses','payments','receipts','cards','statements','cardPayments','staff','advances','extras','rentals','rentalReceipts','products','warehouses'}
SENSITIVE={'events':{'revenue','budget','vat'},'externalRentals':{'expense'},'maintenance':{'cost'},'rentals':{'dailyRate','discount','vat','billing','incomeMode','billDays'}}
class Connection(sqlite3.Connection):
 def __exit__(self,*args):
  try:return super().__exit__(*args)
  finally:self.close()
def connect():
 c=sqlite3.connect(DB,factory=Connection);c.row_factory=sqlite3.Row;return c
def initialize():
 DB.parent.mkdir(parents=True,exist_ok=True)
 with connect() as c:
  c.executescript('CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT UNIQUE,salt TEXT,hash TEXT,role TEXT);CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT,expires REAL);CREATE TABLE IF NOT EXISTS records(kind TEXT,id TEXT,payload TEXT,PRIMARY KEY(kind,id));CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,data BLOB);CREATE TABLE IF NOT EXISTS audit(at TEXT,user TEXT,action TEXT);')
def pw(password,salt):return hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),250000).hex()
def allowed(role,kind,write=False):return role=='admin' or role=='finance' and kind in business.FINANCE or role=='operations' and kind in business.OPS or (role=='finance' and kind in FINANCE|{'events','documents','dispatches','returns','stockMoves'} and (not write or kind not in {'dispatches','returns','stockMoves'})) or (role=='operations' and kind in {'events','resources','allocations','tasks','operations','warehouses','products','stockMoves','rentals','dispatches','returns'} and (not write or kind not in {'events','rentals'}))
def read_data(c,role):
 out={k:[] for k in SCHEMA if allowed(role,k)}
 for r in c.execute('SELECT * FROM records'):
  if r['kind'] in out:
   x=json.loads(r['payload']);x['id']=r['id']
   if role=='operations':x={k:v for k,v in x.items() if k not in SENSITIVE.get(r['kind'],set())}
   out[r['kind']].append(x)
 return out
def validate(kind,x,c):
 from datetime import datetime,date
 clean={}
 for key,label,t in SCHEMA[kind]:
  v=x.get(key,'')
  if t in {'money','integer','nonnegative'}:
   if isinstance(v,bool):raise ValueError(label+' geçersiz')
   v=float(v)
   if not 0<=v<=1e12 or (t=='integer' and (v<1 or v!=int(v))) or (t=='nonnegative' and v!=int(v)):raise ValueError(label+' geçersiz')
   v=round(v,2) if t=='money' else int(v)
  else:
   if not isinstance(v,str) or len(v)>500:raise ValueError(label+' geçersiz')
   v=v.strip()
   if not v and t not in {'optional','optionaldate'} and not t.startswith('optref:'):raise ValueError(label+' gerekli')
   if t in {'date','optionaldate'} and v:date.fromisoformat(v)
   if t=='datetime':datetime.fromisoformat(v)
   if t=='last4' and (len(v)!=4 or not v.isdigit()):raise ValueError('Kartın yalnızca son 4 hanesi gerekli')
   if t.startswith('enum:') and v not in t[5:].split(','):raise ValueError(label+' geçersiz')
   if (t.startswith('ref:') or t.startswith('optref:')) and v:
    if not c.execute('SELECT 1 FROM records WHERE kind=? AND id=?',(t.split(':')[1],v)).fetchone():raise ValueError(label+' bulunamadı')
  clean[key]=v
 if kind=='allocations' and clean['end']<=clean['start']:raise ValueError('Bitiş başlangıçtan sonra olmalı')
 if kind=='payments' and clean['method']=='Kredi kartı' and (not clean['card'] or not clean['firstDue']):raise ValueError('Kart ve ilk taksit vadesi gerekli')
 if kind=='payments' and clean['method']!='Kredi kartı':clean.update(card='',installments=1,firstDue='')
 if kind=='payments' and clean['installments']>60:raise ValueError('En fazla 60 taksit')
 if kind=='statements' and clean['due']<clean['cutoff']:raise ValueError('Vade hesap kesiminden önce olamaz')
 if kind=='operations' and clean['status']=='Tamamlandı' and not clean['evidence']:raise ValueError('Tamamlanan kontrol için teyit notu veya belge referansı girin')
 business.validate(kind,clean)
 return clean
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def send(self,status,data,ctype='application/json',headers={}):
  b=json.dumps(data,ensure_ascii=False).encode() if ctype=='application/json' else data
  self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(b)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
  for k,v in headers.items():self.send_header(k,v)
  self.end_headers();self.wfile.write(b)
 def user(self,c):
  cookie=self.headers.get('Cookie','');token=next((v.split('=',1)[1] for v in cookie.split('; ') if v.startswith('orgsession=')),'')
  return c.execute('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user WHERE token=? AND expires>?',(token,time.time())).fetchone()
 def do_GET(self):
  path=urlparse(self.path).path
  if self.headers.get('Host','').split(':')[0] not in {'127.0.0.1','localhost'}:return self.send(403,{'error':'Yerel adres gerekli'})
  if path in {'/','/app.js','/style.css','/sample.json','/warehouse.js'}:
   file={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/warehouse.js':'warehouse.js','/sample.json':'sample.json'}[path];return self.send(200,(ROOT/file).read_bytes(),{'/':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8','/warehouse.js':'text/javascript; charset=utf-8','/sample.json':'application/octet-stream'}[path])
  if path in {'/experience.css','/brand-mark.png'}:return self.send(200,(ROOT/path[1:]).read_bytes(),'image/png' if path.endswith('.png') else 'text/css; charset=utf-8')
  if path in {'/business.js','/qrcode.js','/experience.js'}:return self.send(200,(ROOT/path[1:]).read_bytes(),'text/javascript; charset=utf-8')
  with connect() as c:
   user=self.user(c)
   if path=='/api/session':return self.send(200,{'setup':not c.execute('SELECT 1 FROM users').fetchone(),'user':{'name':user['name'],'role':user['role']} if user else None})
   if not user:return self.send(401,{'error':'Giriş gerekli'})
   if path=='/api/data':return self.send(200,{'data':read_data(c,user['role']),'schema':{k:[f for f in v if user['role']!='operations' or f[0] not in SENSITIVE.get(k,set())] for k,v in SCHEMA.items() if allowed(user['role'],k)},'write':[k for k in SCHEMA if allowed(user['role'],k,True)],'users':[dict(r) for r in c.execute('SELECT name,role FROM users')] if user['role']=='admin' else []})
   if path=='/api/audit':
    if user['role']!='admin':return self.send(403,{'error':'Yönetici gerekli'})
    return self.send(200,{'rows':[dict(r) for r in c.execute('SELECT at,user AS actor,action FROM audit ORDER BY rowid DESC LIMIT 200')]})
   if path=='/api/backup':
    if user['role']!='admin':return self.send(403,{'error':'Yönetici gerekli'})
    backup={'version':1,'data':read_data(c,'admin'),'files':{r['id']:base64.b64encode(r['data']).decode() for r in c.execute('SELECT * FROM files')}}
    return self.send(200,backup,headers={'Content-Disposition':'attachment; filename="organizasyon-yedek.json"'})
   if path=='/api/export':
    bio=io.BytesIO()
    with zipfile.ZipFile(bio,'w',zipfile.ZIP_DEFLATED) as z:
     for k,rows in read_data(c,user['role']).items():
      s=io.StringIO();fields=['id']+[f[0] for f in SCHEMA[k] if not(user['role']=='operations' and f[0] in SENSITIVE.get(k,set()))];w=csv.DictWriter(s,fieldnames=fields,delimiter=';',extrasaction='ignore');w.writeheader()
      for row in rows:w.writerow({key: "'"+v if isinstance(v,str) and v.startswith(('=','+','-','@')) else v for key,v in row.items()})
      z.writestr(k+'.csv',s.getvalue().encode('utf-8-sig'))
    return self.send(200,bio.getvalue(),'application/zip',{'Content-Disposition':'attachment; filename="excel-tablolari.zip"'})
   if path.startswith('/api/file/'):
    if not allowed(user['role'],'documents'):return self.send(403,{'error':'Yetki yok'})
    f=c.execute('SELECT data FROM files WHERE id=?',(path.rsplit('/',1)[1],)).fetchone()
    if f:return self.send(200,f['data'],'application/octet-stream',{'Content-Disposition':'attachment; filename="belge"'})
   self.send(404,{'error':'Bulunamadı'})
 def do_POST(self):
  origin=self.headers.get('Origin');host=self.headers.get('Host')
  if (host or '').split(':')[0] not in {'127.0.0.1','localhost'}:return self.send(403,{'error':'Yerel adres gerekli'})
  if origin and origin!='http://'+host:return self.send(403,{'error':'Kaynak reddedildi'})
  if self.headers.get('Content-Type')!='application/json':return self.send(415,{'error':'JSON gerekli'})
  n=int(self.headers.get('Content-Length',0))
  if n>20*1024*1024:return self.send(413,{'error':'En fazla 20 MB istek'})
  try:
   x=json.loads(self.rfile.read(n));path=urlparse(self.path).path
   with LOCK,connect() as c:
    user=self.user(c)
    if path in {'/api/setup','/api/login'}:
     name=x.get('name','').strip();password=x.get('password','')
     if path=='/api/setup':
      if c.execute('SELECT 1 FROM users').fetchone():return self.send(409,{'error':'Yönetici zaten var'})
      if len(password)<10 or not name:raise ValueError('Kullanıcı adı ve en az 10 karakterli parola gerekli')
      salt=secrets.token_hex(16);c.execute('INSERT INTO users VALUES(?,?,?,?,?)',(secrets.token_hex(12),name,salt,pw(password,salt),'admin'))
     u=c.execute('SELECT * FROM users WHERE name=?',(name,)).fetchone()
     if not u or not hmac.compare_digest(pw(password,u['salt']),u['hash']):return self.send(401,{'error':'Kullanıcı adı veya parola hatalı'})
     token=secrets.token_hex(32);c.execute('INSERT INTO sessions VALUES(?,?,?)',(token,u['id'],time.time()+28800));return self.send(200,{'ok':True},headers={'Set-Cookie':f'orgsession={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'})
    if not user:return self.send(401,{'error':'Giriş gerekli'})
    if path=='/api/logout':
     c.execute('DELETE FROM sessions WHERE user=?',(user['id'],));return self.send(200,{'ok':True},headers={'Set-Cookie':'orgsession=; Path=/; Max-Age=0'})
    if path=='/api/users':
     if user['role']!='admin':return self.send(403,{'error':'Yönetici gerekli'})
     if x.get('role') not in {'admin','finance','operations'} or len(x.get('password',''))<10 or not x.get('name','').strip():raise ValueError('Ad, rol ve en az 10 karakterli parola gerekli')
     salt=secrets.token_hex(16);c.execute('INSERT INTO users VALUES(?,?,?,?,?)',(secrets.token_hex(12),x['name'].strip(),salt,pw(x['password'],salt),x['role']))
    elif path in {'/api/convert-quote','/api/revise-quote'}:
     if user['role'] not in {'admin','finance'}:return self.send(403,{'error':'Yetki yok'})
     for kind,rid,record in (business.revise if path.endswith('revise-quote') else business.convert)(read_data(c,'admin'),x.get('id'),secrets.token_hex(12)):
      c.execute('INSERT OR REPLACE INTO records VALUES(?,?,?)',(kind,rid,json.dumps(validate(kind,record,c),ensure_ascii=False)))
    elif path=='/api/record':
     kind=x.get('kind')
     if kind not in SCHEMA or kind=='documents' or not allowed(user['role'],kind,True):return self.send(403,{'error':'Bu kaydı değiştirme yetkiniz yok'})
     rid=x.get('id') or secrets.token_hex(12)
     old=c.execute('SELECT payload FROM records WHERE kind=? AND id=?',(kind,rid)).fetchone();existing=json.loads(old['payload']) if old else {}
     if kind=='approvals' and existing and existing.get('status')!='Bekliyor':raise ValueError('Karar verilmiş onay kaydı kilitli; yeni sürüm için yeni kayıt açın')
     if kind=='quotes' and existing.get('event'):raise ValueError('Dönüştürülen teklif kilitli')
     if kind=='quoteLines':
      for qid in {existing.get('quote'),x['record'].get('quote')}:
       q=c.execute("SELECT payload FROM records WHERE kind='quotes' AND id=?",(qid,)).fetchone()
       if q and json.loads(q['payload']).get('event'):raise ValueError('Dönüştürülen teklif kilitli')
     if user['role']=='operations':
      for f in SENSITIVE.get(kind,set()):x['record'][f]=existing.get(f,0 if f=='cost' else '')
     clean=validate(kind,x['record'],c)
     warehouse.validate(kind,clean,c,rid)
     c.execute('INSERT OR REPLACE INTO records VALUES(?,?,?)',(kind,rid,json.dumps(clean,ensure_ascii=False)))
    elif path=='/api/upload':
     if not allowed(user['role'],'documents',True) and user['role']!='operations':return self.send(403,{'error':'Yetki yok'})
     blob=base64.b64decode(x['data'],validate=True)
     if len(blob)>10*1024*1024:raise ValueError('Belge en fazla 10 MB olabilir')
     target=x['target'];kind,sep,rid=target.partition(':')
     if user['role']=='operations' and kind!='fieldReports':return self.send(403,{'error':'Yetki yok'})
     if kind not in {'expenses','payments','receipts','statements','cardPayments','fieldReports','approvals'} or not c.execute('SELECT 1 FROM records WHERE kind=? AND id=?',(kind,rid)).fetchone():raise ValueError('Bağlanacak kayıt bulunamadı')
     name=Path(x['name']).name
     if Path(name).suffix.lower() not in {'.pdf','.png','.jpg','.jpeg','.webp'}:raise ValueError('PDF veya görsel seçin')
     fid=secrets.token_hex(12);c.execute('INSERT INTO files VALUES(?,?)',(fid,blob));c.execute('INSERT INTO records VALUES(?,?,?)',('documents',fid,json.dumps({'target':target,'name':name})))
    elif path=='/api/restore':
     if user['role']!='admin':return self.send(403,{'error':'Yönetici gerekli'})
     for k in business.SCHEMA:x.setdefault('data',{}).setdefault(k,[])
     if x.get('version')!=1 or set(x.get('data',{}))!=set(SCHEMA):raise ValueError('Yedek biçimi geçersiz')
     # Validate in a separate temporary database before touching current records.
     tmp=sqlite3.connect(':memory:');tmp.row_factory=sqlite3.Row;tmp.execute('CREATE TABLE records(kind TEXT,id TEXT,payload TEXT,PRIMARY KEY(kind,id))')
     for k,rows in x['data'].items():
      for r in rows:tmp.execute('INSERT INTO records VALUES(?,?,?)',(k,r['id'],json.dumps(r)))
     for k,rows in x['data'].items():
      for r in rows:validate(k,r,tmp)
     for k,rows in x['data'].items():
      if k in warehouse.SCHEMA:
       for r in rows:warehouse.validate(k,r,tmp,r['id'])
     blobs={k:base64.b64decode(v,validate=True) for k,v in x.get('files',{}).items()}
     if set(blobs)!={r['id'] for r in x['data']['documents']}:raise ValueError('Yedekte belge dosyaları eksik')
     # Automatic pre-restore copy includes users and documents.
     snapshot=ROOT/('before-restore-'+str(int(time.time()))+'.sqlite3');dest=sqlite3.connect(snapshot);c.backup(dest);dest.close()
     c.execute('DELETE FROM records');c.execute('DELETE FROM files')
     for k,rows in x['data'].items():
      for r in rows:c.execute('INSERT INTO records VALUES(?,?,?)',(k,r['id'],json.dumps(validate(k,r,tmp),ensure_ascii=False)))
     for fid,b in blobs.items():c.execute('INSERT INTO files VALUES(?,?)',(fid,b))
    else:return self.send(404,{'error':'Bulunamadı'})
    c.execute('INSERT INTO audit VALUES(?,?,?)',(time.strftime('%Y-%m-%dT%H:%M:%S'),user['name'],path));self.send(200,{'ok':True})
  except (ValueError,KeyError,TypeError,sqlite3.IntegrityError) as e:self.send(400,{'error':str(e)})
if __name__=='__main__':
 initialize();ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('ORG_PORT','5188'))),Handler).serve_forever()
