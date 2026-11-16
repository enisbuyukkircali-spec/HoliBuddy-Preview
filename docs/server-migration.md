# HoliBuddy sunucuya taşıma

Hedef IP: **2.59.181.242**. Alan adları: **holibuddy.com** ve **www.holibuddy.com**.

Bu dosya kurulum hazırlığıdır. Hedef sunucuya erişilip kurulum yapılmadı; DNS değiştirilmedi.
Sunucunun işletim sistemi, yönetim paneli, Node.js desteği ve yetkili erişimi doğrulanmalıdır.

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

## Yayına geçmeden önce

1. Sunucuya mevcut sitelerle çakışmadan kurulum yap, gerekli ortam değerlerini aktar.
2. Yerelde `/`, görseller, `/yardim`, `/iletisim?konu=aftersales`, `/api/contact`,
   `/api/fx` ve `/api/enuygun?action=status` yanıtlarını doğrula.
3. `/healthz` yalnızca uygulamanın ayakta olduğunu gösterir; Enuygun erişim testi değildir.
   Enuygun durumundaki `configured: true` da yalnızca değişkenlerin varlığını gösterir.
   Yeni sunucudan lokasyon ve gerçek müsaitlik sorgusu ayrıca denenmelidir; rezervasyon
   oluşturma veya ödeme işlemi kullanılmaz.
4. Sunucunun gerçek dışarı çıkış IP'sini doğrula. Enuygun'un izin listesine girmesi gereken
   adres budur; NAT varsa hedef web IP'siyle aynı olmayabilir.
5. `holibuddy.com` ve `www.holibuddy.com` için geçerli TLS sertifikası hazırla.
   DNS sağlayıcısında DNS-01 doğrulaması kullanılabilirse web DNS'ini değiştirmeden
   sertifika alınabilir. Sertifika doğrulamasını kapatma. Yeni sunucuyu alan adı ile
   test etmek için yerel `curl --resolve` veya hosts kaydı kullanılabilir.
6. Hedef hosting sağlayıcısı/ülkesi kesinleşince gizlilik metnindeki Vercel açıklamasını
   gerçek altyapıya göre güncelle. Taşınmadan önce gerçeğe aykırı bir sağlayıcı yazma.
7. GoDaddy'de mevcut web A/AAAA/CNAME kayıtlarını yedekle. `@` A kaydı `2.59.181.242`
   olur. `www` ana alan adına CNAME olabilir; o isimde çakışan kayıt bırakma.
   Eski IPv6/AAAA kaydı varsa yeni sunucunun IPv6 desteğine göre değerlendir.
   **MX, SPF, DKIM, DMARC ve diğer e-posta kayıtlarını koru.**
8. DNS yayılımı ve hem ana alan adı hem www için HTTPS, yönlendirme ve API sorgularını
   doğrula. Geri dönüş için eski Vercel dağıtımını ve önceki DNS değerlerini sakla.

## Mevcut işlevlerin sınırları

Taşıma tek başına Enuygun IP iznini, gerçek üyelik sistemini, SMTP veya İYS kaydını
tamamlamaz. İletişim SMTP yapılandırılana kadar e-posta taslağı modunda kalır. Üyelik
verileri tarayıcıda saklanır. Bülten kapalıdır. Bunlar taşıma kontrolünde ayrı raporlanır.
