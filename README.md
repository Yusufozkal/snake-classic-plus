# Snake Classic+

Telefon, tablet ve bilgisayarda oynanabilen yılan oyunu. Menü ve oyun dili Türkçedir.

## Özellikler

- Klavyede yön tuşları / WASD, dokunmatik ekranda kaydırma kontrolü.
- Altı harita, üç zorluk seviyesi ve antrenman modu.
- Özel yemler, güçler, renkler ve kostümler.
- İsteğe bağlı öğretici; günlük görevler, başarımlar ve oyuncu ilerlemesi.
- Ortak skor tablosu ve sunucuda hamle kaydıyla skor doğrulaması.
- Veritabanı geçişleri, yönetici ekranı ve güvenlik bildirim sayfası.

## Bilgisayarında çalıştır

Node.js 22.13 veya üzeri gerekir.

```sh
npm run dev
```

Tarayıcıda **http://localhost:3000/** adresini aç. Derleme, yerel sunucu ve testler Node.js'in yerleşik araçlarını kullanır; bu akış için paket kurulumu gerekmez. Kaynak değiştirildiğinde sunucuyu durdurup yeniden başlat.

Yerel sunucu SQLite veritabanını `.local/preview.sqlite` dosyasında oluşturur ve `drizzle/` içindeki geçişleri otomatik uygular. Bu dosya Git'e eklenmez.

Ayrı derleme ve başlatma:

```sh
npm run build
npm start
```

## Testler

```sh
npm run test:security
npm run test:foods
```

Testler; skor sahteciliğini, hamle doğrulamasını, istek sınırlarını, hesap/yönetici erişimlerini, eski oyun sürümlerinin uyumluluğunu ve yemlerin etkilerini denetler. Test verileri bellekte oluşturulur.

## Kaynak düzeni

| Dosya / klasör | İçerik |
| --- | --- |
| `public/game.html` | Menü, kontroller ve oyun motoru |
| `public/admin.html` | Yönetici ekranı |
| `server/worker.js` | HTTP uçları, skorlar, profiller ve güvenlik |
| `server/replay-template.js` | Güncel sunucu doğrulama motoru şablonu |
| `server/replay-v1.js`, `server/replay-v2.js` | Eski oyunlar için sabitlenmiş kurallar |
| `drizzle/` | Veritabanı geçişleri |
| `tests/` | Güvenlik ve oyun kuralları testleri |
| `build-worker.cjs` | HTML ile aynı kurallardan Worker ve doğrulayıcı üretir |
| `serve-worker.cjs` | Yerel HTTP / SQLite adaptörü |

## Hesap ve barındırma

Yerel sunucuda misafir olarak oynanır. ChatGPT ile giriş ve yönetici erişimi, özgün barındırma ortamının doğrulanmış kimlik entegrasyonuna bağlıdır. Yerel adaptör, istemciden gelen kimlik başlıklarını siler; yalnızca `ADMIN_EMAIL` tanımlamak yönetici erişimi sağlamaz.

### Ortam değişkenleri

| Değişken | Anlamı |
| --- | --- |
| `ADMIN_EMAIL` | Yönetici ekranını açabilecek hesabın e-postası. |
| `TRUST_PLATFORM_IDENTITY` | Yalnızca `1` olduğunda `oai-authenticated-*` kimlik başlıkları dikkate alınır. Sites yayınında `1` olmalıdır; aksi hâlde herkes misafir sayılır ve yönetici ekranı kapalı kalır. |
| `SHARED_START_LIMIT_PER_MINUTE` | Ağ adresi alınamayan misafirlerin ortak olarak dakikada başlatabileceği oyun sayısı (varsayılan 120). Yönetici ekranındaki trafik özetine göre ayarlanır. |

`TRUST_PLATFORM_IDENTITY` bir kimlik doğrulama yöntemi **değildir**. Yalnızca "bu ortamda başlıkları platform yazıyor ve ziyaretçiden gelen kopyaları siliyor" beyanıdır; başlıkların gerçekliğini denetlemez. Ziyaretçinin bu başlıkları kendisinin gönderebildiği bir sunucuda `1` yapılırsa herkes istediği hesap ve yönetici gibi davranabilir. Amacı, kod başka bir ortama kopyalandığında varsayılan olarak kapalı kalmasıdır. `.env.example` sadece örnektir; sunucu `.env` dosyasını otomatik yüklemez.

Başka bir sağlayıcıya dağıtırken kimlik doğrulamasını o ortama uyarlamak ve veritabanını bağlamak gerekir. Mevcut Worker, güvenilir platformun kimlik başlıklarını esas alır; bu uçları aynı başlıkları ziyaretçinin belirleyebildiği bir sunucuda doğrudan yayınlamayın.

Tam oyun bir sunucu ve veritabanı gerektirir; GitHub Pages tek başına bu işlevleri çalıştırmaz. `build-static.cjs` / `serve-static.cjs` tam uygulamanın yerine geçmez.

Bu depodaki `.openai/hosting.json` yalnızca mantıksal veritabanı bağını içerir. Özgün site kimliği, erişim anahtarları, hesaplar, oyuncu kayıtları ve yerel veritabanları paylaşılmaz. Yeni bir Sites yayını için kendi proje kimliğiniz gerekir.
