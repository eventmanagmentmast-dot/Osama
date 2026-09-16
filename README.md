# Organizasyon Yönetim Merkezi

## İş merkezi

Yeni başlangıç ekranı satış, planlama, depo ve finans işlemlerini bir araya getirir.
Müşteri rehberi → iş fırsatı → teklif ve kalemleri → onay → etkinlik akışı vardır.
Onaylı teklif tek işlemde etkinlik bütçesini, hazırlık görevini ve kiralama
kalemlerinden taslak rezervasyonları oluşturur. Taslak rezervasyonlar kapasiteyi
bloke etmez; teslim saatleri ve stok teyidinden sonra onaylanmalıdır. Dönüştürülen
teklif kilitlenir. Yeni revizyon önceki kalemleri kopyalar; aynı iş fırsatı ikinci
etkinliğe dönüştürülmez. Mevcut işe ilaveler Ek işler bölümünden izlenir.

- Teklif PDF'i tarayıcının Yazdır → PDF olarak kaydet seçeneğiyle alınır.
- Dış kiralama ve taşeron hakedişi finans giderine bağlanır. Bu bölümler ikinci
  maliyet yaratmaz; gider bağlantısı ve hakediş farkları kontrol edilmelidir.
- Ortak takvim tarih aralığıyla rezervasyonları, çakışma raporu kapasiteyi gösterir.
- QR etiketi ürün kodunu içerir; etiket bilgisi üçüncü taraf servisine gönderilmez.
  Kamera tarayıcı desteği ve kullanıcı izni gerektirir. Destek yoksa kodla arama
  veya klavye gibi çalışan barkod okuyucu kullanılabilir.
- Bakım kayıtları stok hareketi yaratmaz; hasarlı çıkış/sağlam giriş depo
  hareketlerinden kaydedilir. Yatırım raporu bağımsız faturalanmış kiralama
  gelirinden tamamlanan bakım tutarını düşer; tam muhasebe kârı değildir.
- Bildirim merkezi panel içindedir; kendiliğinden e-posta/SMS göndermez.
- Yönetici son 200 işlemi görebilir. JSON yedekleri yeni kayıt türlerini kapsar;
  önceki sürüm yedeklerinde eksik yeni bölümler boş kabul edilir.

### LCV, giriş ve ulaşım

LCV ekranı kişi bazında yaka kartı tipi, yemek, gala ve kokteyl katılımını,
atanan giriş kapısını, alerji ve erişilebilirlik notlarını tutar. Her misafire
benzersiz QR kodu üretilir; giriş/çıkış hareketleri kapı ve saatle kaydedilir.
Yaka kartı tarayıcıdan 4 × 3 inç ölçüsünde yazdırılabilir. Kamera ile okuma
desteklenmeyen tarayıcılarda kod elle veya klavye gibi çalışan okuyucuyla girilir.

Ulaşım hizmetleri bir etkinliğe bağlı veya bağımsız satış olarak açılabilir.
Araç sınıfı, araç ve koltuk sayısı, rota, tedarikçi, plaka/iletişim ve kişi bazlı
araç ataması kaydedilir; kapasite aşımı engellenir. Uçuşlar kişi bazında gidiş,
dönüş, IATA rotası, PNR, bagaj, kabin, durum ve son görülen fiyatla izlenir.
Skyscanner canlı fiyat sonuçlarını panel içinde göstermek için resmî partner API
erişimi ve sunucuda `SKYSCANNER_API_KEY` gerekir. Anahtar yokken arama formu seçilen
rota, tarih ve kabinle Skyscanner canlı arama sayfasını açar; anahtar tarayıcıya
ve GitHub'a yazılmaz.

### Ortak yayında müşteri ve saha erişimi

Bulut sürümünde `customer` yalnız e-postasına atanmış onayları ve onların
belgelerini görür; `field` yalnız sorumlu alanında kendi hesap e-postası yazan
görevleri görür, tamamlar ve fotoğraflı saha bildirimi ekler. Genel operasyon rolü
ortak operasyon kayıtlarına erişmeye devam eder. Yeni rollerde finans bilgileri
sunucudan gönderilmez. Bu roller yerel kullanıcı sistemine eklenmemiştir.

Müşteri onayı belirli belge sürümüne bağlanır; karar verildikten sonra kayıt
kilitlenir. Teklif veya ek iş bağlantısı varsa müşteri kararı ilgili kayda da
aktarılır. Bu kayıt elektronik imza hizmeti değildir. Müşteriye gösterilecek
teklif/tasarım dosyasını onay kaydına ekleyin. Kişileri kullanıma açmak için hem
Sites erişim listesi hem panelde e-posta/rol ataması gerekir; bu geliştirme
mevcut yayınların erişim listesini değiştirmez.

### Açık demo

`public-demo/` yalnız örnek veriyle çalışır; gerçek kayıtlar, hesaplar ve belgeler
pakete alınmaz. Yenilemede değişiklikler silinir. Müşteri/saha hesabı yetkileri
sunuculu ortak sürüme aittir. QR bileşeni `qrcode-generator` 1.4.4, MIT lisanslıdır;
kaynak telif bildirimi `qrcode.js` içinde korunur.

## Ortak bulut sürümü

Bulut sürümü `cloud/` klasöründedir. Sites üzerinde HTTPS, ChatGPT kimliği,
ortak D1 veritabanı ve R2 belge saklama kullanır. Yerel Python sürümü korunur.
Bulut ve bilgisayardaki veritabanları otomatik eşitlenmez. Gerçek yerel veriler
yayın paketine dahil edilmez; veri aktarımı ayrıca seçilerek yapılmalıdır.

İlk yayın yalnızca site sahibine açıktır. Sunucudaki `OWNER_EMAIL` ayarı
yöneticiyi belirler. Ekip üyelerine hem Sites erişimi hem panelde e-posta/rol
atanmalıdır. Panelde `Erişimi kapat` rolü ilgili kullanıcının veri erişimini keser.
Parolalar GitHub'a veya uygulamaya kaydedilmez; giriş Sites üzerinden yapılır.

Kayıtlar 30 saniyede yenilenir; açık form varken otomatik yenileme yapılmaz.
Eşzamanlı değişiklikler veritabanı sürümüyle kontrol edilir; eski sürümle yapılan
yazma reddedilir. Bu nedenle bir kullanıcının değişikliği sessizce kaybolmaz.
JSON yedeğinde toplam belge boyutu 12 MB, tek geri yüklemede 1000 kayıt sınırı
vardır. Geri yükleme öncesi R2'ye yedek alınır. R2'de eski belgeler ve bu yedekler
otomatik silinmez. Düzenli harici yedek indirilmelidir.

Bulut geliştirme: `npm ci`, `npm run build`, `npm run test:cloud`.
Testler Node 22.13+ ve geçici bellek içi SQLite kullanır. Şema değişiklikleri
`npm run db:generate` ile üretilir; yayımlanmış migration dosyaları değiştirilmez.
`cloud/schema.json` yerel `server.SCHEMA` ile aynı tutulmalıdır.

GitHub güncellemesi tek başına canlı yayını değiştirmez. Her geliştirmede
GitHub yeniliklerini al, yerel ve bulut testlerini çalıştır, kaynakları GitHub'a
gönder, ardından aynı sürümü Sites üzerinden yayımla ve sonucu doğrula.
Sites kaynak deposu ve GitHub `origin` farklı hedeflerdir. Kimlik bilgileri
dosyalara veya Git uzak adreslerine yazılmaz. Ücretli hizmet satın alınmamıştır;
platform kotaları ve erişim politikaları yayın hizmetinin koşullarına bağlıdır.

Konser, festival, fuar ve etkinlik işleri için yerel prototip. Python standart kütüphanesi, SQLite ve tarayıcı arayüzü kullanır. Python 3.11+ yeterlidir; çalışma bağımlılığı kurulmaz.

## Çalıştırma

```sh
python make_sample.py
python server.py
```

http://127.0.0.1:5188/ adresini açın. Hesapsız örnek mod geçicidir. Kalıcı kayıt için ilk yönetici hesabını arayüzde oluşturun. Veritabanı başlangıçta boştur. Örnek veriler gerçek fiyat, belge, hesap veya müşteri bilgisi değildir.

## Bölümler

- Etkinlikler, bütçe, giderler, müşteri tahsilatı, ek işler ve iadeler
- Tedarikçi cari hesap, personel ücret/avans bakiyesi, nakit planı
- Kart tanımları, banka ekstreleri, kart borcu ödemeleri ve taksit planı
- Operasyon hazırlık kayıtları, sorumlu/vade/teyit, kritik eksikler
- Kaynak rezervasyonu ve toplam kapasite çakışması
- Depolar, ürün kartları, giriş/çıkış/transfer, kiralama, teslim/iade/hasar/kayıp
- Kira geliri ve tahsilatı; gelirden ayrı depozito takibi
- Finans kayıtlarına PDF/görsel ekleme, Excel uyumlu CSV dışa aktarımı
- Belgeleri kapsayan JSON yedek/geri yükleme ve yerel kullanıcı rolleri

## Veri ve güvenlik sınırı

Yalnızca `127.0.0.1` üzerinde çalışır. İnternete veya şirket ağına doğrudan açılmak için tasarlanmamıştır. Yönetici, muhasebe ve operasyon erişimi sunucuda denetlenir. Oturum çerezleri HttpOnly/SameSite kullanır. Parolalar PBKDF2 ile tuzlanarak saklanır. TLS, MFA, parola sıfırlama, giriş denemesi kısıtlama ve üretim sunucusu bu prototipte yoktur. Kaynak kodunu GitHub'a koymak uygulamayı internete açmaz.

Veritabanları, yüklenen belgeler, kullanıcılar ve yedekler Git'e dahil edilmez. `records.sqlite3` gerçek kayıtları içerir. JSON yedeği belgeleri içerir ama hesap/parolaları içermez. Geri yükleme mevcut kayıtlardan önce veritabanı kopyası alır. Yedekleri ayrıca saklayın.

## Hesaplama sınırları

Kârlılık girilmiş net giderler ve personel ücretleriyle hesaplanır. Avans ve kart borcu ödemeleri ikinci gider değildir. Faturasız giderlerde net/KDV teyidi gerekir. Ekstre ve taksit planı toplanmaz; nakit planı kart başına son ekstreyi esas alır, henüz ekstreleşmemiş taksitleri içermez. Kasa/banka açılış bakiyesi veya canlı banka bağlantısı yoktur.

Kira günleri kullanıcı tarafından belirlenir. Depozito gelir değildir. Faturalanmış bağımsız kira geliri ilgili etkinlik gelirine eklenebilir; sözleşmeye dahil olan yeniden eklenmez. Hasarlı iade kullanılabilir stok değildir. İade/kayıp toplamı teslim miktarını aşamaz. Stok müsaitliği mevcut stoktan gelecekteki en yüksek sevk edilmemiş rezervasyonu düşer; beklenen iadeler henüz stok sayılmaz.

## Testler

```sh
python make_sample.py
python test_server.py
node test_logic.js
```

Sunucu testleri geçici veritabanı ve geçici kullanıcılarla çalışır; gerçek kayıtları değiştirmez. Node yalnızca arayüz hesaplama testleri için gereklidir.

## Ortak geliştirme

Her değişiklik için ayrı dal ve pull request kullanın. İş kayıtlarını veya gerçek belgeleri issue/PR içine eklemeyin. Büyük değişikliklerde yedek alın; testleri çalıştırın. Bu depo henüz kamuya açık kullanım için lisanslanmamıştır.
