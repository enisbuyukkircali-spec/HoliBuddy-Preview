# HoliBuddy sunucuya taşıma

Hedef IP: **2.59.181.242**. Alan adları: **holibuddy.com** ve **www.holibuddy.com**.

## Kurulacak kaynak ve mevcut durum — 16 Kasım 2026

Ubuntu kurulumu için kullanılacak kaynak **enisbuyukkircali-spec/HoliBuddy-Preview**,
dal **main**. Vercel'de yayınlanan ve bu çalışmada geliştirilen sürüm bu depodur.
Sunucu uyarlaması `9dd1601fc36d24bc36e5c53e45f254689c483f8e` commit'inde eklendi;
bu uygulama kodunun 19 otomatik kontrolü geçti. Bu depo HTML/CSS/JavaScript ve Node.js
kullanır; çalıştırma komutu `npm run serve:server` olur.

**DNS işlemi tamamlandı:** GoDaddy'de `@` için tek A kaydı `2.59.181.242`, `www` için
CNAME `holibuddy.com.` olarak kaydedildi ve dış DNS sorgusunda doğrulandı. Eski
`216.150.1.1` ve `216.150.16.1` A değerleri artık kullanılmıyor. E-posta kayıtları korundu.

**Hedef sunucu kurulumu henüz tarafımızdan yapılmadı veya doğrulanmadı.** Son bağlantı
kontrolünde HTTPS bağlantı hatası alındı; tarayıcıda `ERR_SSL_PROTOCOL_ERROR` görüldü.
Bu nedenle DNS'in doğru olması, uygulama ve API'lerin çalıştığı anlamına gelmez.
Ubuntu sunucusundaki servis, ters vekil, sertifika ve ortam değişkenleri kontrol edilmelidir.

Kurulum dosyaları:

- `server/app.cjs`: mevcut dört API işlevini ve sayfaları çalıştıran HTTP sunucusu.
- `server/build-public.cjs`: yayınlanacak dosyaları `dist/standalone` içine hazırlayan komut.
- `deploy/holibuddy.service`: Ubuntu/systemd için uyarlanacak servis tanımı.
- `deploy/holibuddy.env.example`: sunucuda tanımlanması gereken ortam değişkenleri.

## Uygulamayı çalıştırma

Proje statik sayfalar ve dört Node.js API uç noktasından oluşur. Yalnızca HTML dosyalarını
hosting dizinine kopyalamak Enuygun, iletişim ve döviz uç noktalarını çalıştırmaz.

Node.js 24 LTS ve npm ile, depo kökünde:

```sh
npm ci --omit=dev
npm run prepare:server
npm run serve:server
```

Varsayılan dinleme adresi `127.0.0.1:3000` olur. Bu servis TLS sağlayan bir ters vekilin
arkasında çalıştırılmalıdır. `dist/standalone` yalnızca yayınlanacak dosyaları içerir;
depo kökü, `api`, `config`, `server` ve `.env` dosyaları web dizini olarak sunulmaz.
Yeni yayın öncesi `prepare:server` tekrar çalıştırılır; çalışan sürümün dizinini yerinde
silmek yerine ayrı sürüm dizini hazırlanıp servis yeniden başlatılır.

Mevcut `vercel.json` temiz URL ve yönlendirmeleri sunucu tarafından okunur. Sorgu
parametreleri korunur. Vercel için varsayılan build komutu değiştirilmemiştir.

## Ortam değişkenleri ve servis

`deploy/holibuddy.env.example` yalnızca değişken isimlerini gösterir. Gerçek Enuygun
değerleri mevcut üretim ortamından yetkili olarak aktarılmalı; GitHub'a, ekran görüntüsüne
veya komut geçmişine yazılmamalıdır. Linux/systemd için örnek servis
`deploy/holibuddy.service` dosyasındadır. Sunucu doğrulandıktan sonra şu koşullarla uyarlanır:

- Uygulama hesabı: yetkisiz `holibuddy` sistem kullanıcısı.
- Kod yolu: `/opt/holibuddy/current`; `dist/standalone` önceden hazırlanmış olmalı.
- Node.js ikili yolu: örnekte `/usr/bin/node`; gerçek kurulumdaki yol doğrulanmalı.
- Ortam dosyası: `/etc/holibuddy/holibuddy.env`, yalnızca root tarafından okunabilir (0600).
- Servis dışarıya doğrudan açılmaz; yerel ters vekil `127.0.0.1:3000` adresine bağlanır.
- Ters vekil `X-Forwarded-For` başlığını istemciden devralmak yerine gerçek bağlantı IP'siyle
  değiştirir. Nginx karşılığı `proxy_set_header X-Forwarded-For $remote_addr;` olur.
- Vekilde `Host`, `X-Forwarded-Proto`, 180 saniye cevap zaman aşımı ve en fazla 64 KiB
  istek gövdesi ayarlanır. Gereksiz istek gövdesi ve kişisel veri günlüğü tutulmaz.
- `www` adresi HTTPS üzerinde ana alan adına 308 ile yönlendirilir; yol/sorgu korunur.

Sunucu Vercel'in ülke başlığını üretmez; `/api/country` boş ülke döndürür. Kullanıcı
site içindeki mevcut dil/para birimi seçimini kullanabilir. Gerçek IP coğrafi konum
tespiti ancak sunucunun güvenilir altyapısı ayrıca sağlıyorsa eklenmelidir.

## Hedef sunucuda tamamlanacak kontroller

1. Sunucuya mevcut sitelerle çakışmadan kurulum yap, gerekli ortam değerlerini aktar.
2. Yerelde `/`, görseller, `/yardim`, `/iletisim?konu=aftersales`, `/api/contact`,
   `/api/fx` ve `/api/enuygun?action=status` yanıtlarını doğrula.
3. `/healthz` yalnızca uygulamanın ayakta olduğunu gösterir; Enuygun erişim testi değildir.
   Enuygun durumundaki `configured: true` da yalnızca değişkenlerin varlığını gösterir.
   Yeni sunucudan lokasyon ve gerçek müsaitlik sorgusu ayrıca denenmelidir; rezervasyon
   oluşturma veya ödeme işlemi kullanılmaz.
4. Sunucunun gerçek dışarı çıkış IP'sini doğrula. Enuygun'un izin listesine girmesi gereken
   adres budur; NAT varsa hedef web IP'siyle aynı olmayabilir.
5. `holibuddy.com` ve `www.holibuddy.com` için geçerli TLS sertifikasını ve 443 portundaki
   HTTPS yapılandırmasını kontrol et. Alan adı yeni IP'ye yönleniyor. Sertifika
   doğrulamasını kapatma. Yeni sunucuyu alan adı ile test etmek için yerel
   `curl --resolve` veya hosts kaydı kullanılabilir.
6. Hedef hosting sağlayıcısı/ülkesi kesinleşince gizlilik metnindeki Vercel açıklamasını
   gerçek altyapıya göre güncelle. Taşınmadan önce gerçeğe aykırı bir sağlayıcı yazma.
7. GoDaddy'deki mevcut yönlendirmeyi koru: `@` A kaydı `2.59.181.242`, `www` CNAME
   kaydı `holibuddy.com.`. Aynı isimler için eski sunucuya giden ek kayıt oluşturma.
   Son DNS incelemesinde AAAA kaydı yoktu. **MX, SPF, DKIM, DMARC ve diğer e-posta
   kayıtlarını koru.**
8. DNS yayılımı ve hem ana alan adı hem www için HTTPS, yönlendirme ve API sorgularını
   doğrula. Geri dönüş için eski Vercel dağıtımını ve önceki DNS değerlerini sakla.

Gerekirse ayrıca yetkilendirilecek DNS geri dönüşünde önceki kayıtlar: `@` A
`216.150.1.1` ve `216.150.16.1` (TTL 600); `www` CNAME
`11020a514e932cbe.vercel-dns-016.com.` (TTL 3600). Bunlar mevcut yönlendirme değildir.

## Mevcut işlevlerin sınırları

Taşıma tek başına Enuygun IP iznini, gerçek üyelik sistemini, SMTP veya İYS kaydını
tamamlamaz. İletişim SMTP yapılandırılana kadar e-posta taslağı modunda kalır. Üyelik
verileri tarayıcıda saklanır. Bülten kapalıdır. Bunlar taşıma kontrolünde ayrı raporlanır.
