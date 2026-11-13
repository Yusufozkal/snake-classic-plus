# Güvenlik ve kurulum

Güvenlik açığı bildirimlerini canlı oyunun `/security` sayfasından özel olarak iletebilirsin. Açık bildirimlere hesap bilgisi, oturum çerezi veya anahtar ekleme.

## Güvenilir kimlik sınırı

Worker, `oai-authenticated-*` başlıklarını varsayılan olarak yok sayar. `TRUST_PLATFORM_IDENTITY=1` yalnızca Sites gibi gelen kimlik başlıklarını temizleyip doğrulanmış kullanıcı bilgilerini kendisi ekleyen bir platformda ayarlanmalıdır. Bu değer tek başına kimlik doğrulama sağlamaz. Doğrudan internete açık bir sunucuda bu başlıkları istemciden kabul etme.

`ADMIN_EMAIL` yalnızca sunucudaki gizli ortam ayarıdır. Hesap ve yönetici yetkileri her işlemde sunucuda kontrol edilir; oyun ve profil kayıtları kullanıcı kimliğine bağlıdır. Yerel önizleme sunucusu istemciden gelen platform kimlik başlıklarını her zaman temizler.

## İstek ve kayıt sınırları

`TRUSTED_IP_HEADER` varsayılan olarak boştur. Yalnızca güvenilir proxy tarafından üzerine yazıldığı doğrulanmış tek IP başlıklarından biri ayarlanabilir: `cf-connecting-ip`, `true-client-ip`, `x-real-ip`. `X-Forwarded-For` zinciri kimlik kaynağı olarak kullanılmaz. IPv4 değerleri normalleştirilir, IPv6 adresleri aynı `/64` ağı altında gruplanır. IP adresleri veritabanına açık olarak yazılmaz; sunucu anahtarıyla HMAC uygulanır.

- Oyuncu: dakikada 12, kayan 24 saatte 300 yeni oyun.
- Güvenilir IP/ağ: dakikada 12, kayan 24 saatte 300 yeni oyun.
- IP bilgisi olmayan misafirler: ortak dakikada 120 yeni oyun sınırı.
- Tüm site: varsayılan dakikada 120, kayan 24 saatte 10.000 yeni oyun. `SITE_RUNS_PER_MINUTE` ve `SITE_RUNS_PER_DAY` ile 1–100.000 arasında ayarlanabilir.

Limitler tek atomik veritabanı eklemesinde denetlenir. Çerez veya istemci IP başlığı değişse de site genelindeki tavan geçerlidir. Bunlar gelen ağ trafiğinin tamamını sınırlandırmaz; yüksek hacimli saldırılar için hosting katmanında koruma gerekir. Antrenman modu sıralamaya kayıt açmaz. Bir haftadan eski bitirilmemiş oyunlar temizlenir; bitmiş oyun geçmişi korunur.

## Skorlar ve oyuncu kodları

Skor, süre, XP, görev ve başarımlar sunucuda kaydedilen hamlelerin yeniden oynatılmasıyla hesaplanır. Eski oyunlar kayıtlı kural sürümüyle doğrulanır. Bu kontrol otomatik oynayan bir botu insan oyuncudan kesin olarak ayıramaz.

Oyuncu kodları sunucudaki gizli anahtarla üretilir. Görünmez ve yön değiştiren karakterler yeni takma adlardan temizlenir. Mevcut oyun kimliği ve doğru belirteçle yapılan tekrar denemeler yeni ad kuralları nedeniyle bozulmaz.

Skor önbelleği, veritabanı tetikleyicilerinin güncellediği sürümü kontrol eder. Başka Worker örneğindeki skor güncellemesi veya silme işleminden sonra eski sonuç önbellekten sunulmaz. `drizzle/0004_leaderboard_revision.sql` dahil tüm ekli migration dosyalarını Worker güncellemesinden önce uygula; önceki migration dosyalarını değiştirme.

## Kontroller

`npm run test:security` yetkilendirme, sahte skor, atomik kotalar, eski kayıt uyumluluğu, önbellek yarışları ve veritabanı sorgu sayısı testlerini çalıştırır. `npm run test:foods` yem kurallarını denetler. Testler geçici bellek veritabanı kullanır; canlı kayıtları değiştirmez.
