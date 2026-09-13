# Organizasyon Yönetim Merkezi

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
