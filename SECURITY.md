# Güvenlik ve kurulum

Güvenlik açığı bildirimlerini canlı oyunun `/security` sayfasından özel olarak iletebilirsin. Açık bildirimlere hesap bilgisi, oturum çerezi veya anahtar ekleme.

## Güvenilir kimlik sınırı

Worker, `oai-authenticated-*` başlıklarını varsayılan olarak yok sayar. `TRUST_PLATFORM_IDENTITY=1` yalnızca Sites gibi gelen kimlik başlıklarını temizleyip doğrulanmış kullanıcı bilgilerini kendisi ekleyen bir platformda ayarlanmalıdır. Bu değer tek başına kimlik doğrulama sağlamaz. Doğrudan internete açık bir sunucuda bu başlıkları istemciden kabul etme.

`ADMIN_EMAIL` yalnızca sunucudaki gizli ortam ayarıdır. Hesap ve yönetici yetkileri her işlemde sunucuda kontrol edilir; oyun ve profil kayıtları kullanıcı kimliğine bağlıdır. Yerel önizleme sunucusu istemciden gelen platform kimlik başlıklarını her zaman temizler.

## İstek ve kayıt sınırları

`TRUSTED_IP_HEADER` varsayılan olarak boştur. Yalnızca güvenilir proxy tarafından üzerine yazıldığı doğrulanmış tek IP başlıklarından biri ayarlanabilir: `cf-connecting-ip`, `true-client-ip`, `x-real-ip`. `X-Forwarded-For` zinciri kimlik kaynağı olarak kullanılmaz. IPv4 değerleri normalleştirilir, IPv6 adresleri aynı `/64` ağı altında gruplanır. IP adresleri veritabanına açık olarak yazılmaz; sunucu anahtarıyla HMAC uygulanır.

- Oyuncu: dakikada 12, kayan 24 saatte 300 yeni oyun.
- Güvenilir IP/ağ: dakikada 12, kayan 24 saatte 300 yeni oyun.
- Ağ adresi olmayan misafirler: tek ortak kova, dakikada varsayılan 120 yeni oyun. Boyutu `SHARED_START_LIMIT_PER_MINUTE` ile (1–100.000 tam sayı; geçersiz değer 120 sayılır) ayarlanır. Bu kovanın günlük sınırı yoktur; oyuncu başına sınırlar yine geçerlidir.
- Tüm siteyi sayan bir sınır yoktur. Tek bir istemci her istekte yeni çerez gönderse bile yalnızca ortak misafir kovasını doldurabilir; giriş yapmış oyuncular ve ağ adresi bilinen misafirler etkilenmez.

Limitler tek atomik veritabanı eklemesinde denetlenir. Ortak kovanın boyutunu gerçek trafiğe göre ayarlamak için yönetici ekranı son 24 saatteki başlatma sayısını, ortak kovanın payını, en yoğun dakikayı ve gün içinde sınıra takılan istekleri (`security_state` içinde `start_rejected:<tarih>:shared` ve `:network`, 30 gün sonra silinir) gösterir. Bunlar gelen ağ trafiğinin tamamını sınırlandırmaz; yüksek hacimli saldırılar için hosting katmanında koruma gerekir. Antrenman modu sıralamaya kayıt açmaz. Bir haftadan eski bitirilmemiş oyunlar temizlenir; bitmiş oyun geçmişi korunur.

## Skorlar ve oyuncu kodları

Skor, süre, XP, görev ve başarımlar sunucuda kaydedilen hamlelerin yeniden oynatılmasıyla hesaplanır. Eski oyunlar kayıtlı kural sürümüyle doğrulanır. Bu kontrol otomatik oynayan bir botu insan oyuncudan kesin olarak ayıramaz.

Oyuncu kodları sunucudaki gizli anahtarla üretilir. Görünmez ve yön değiştiren karakterler takma adlardan temizlenir; kural öncesinde kaydedilmiş adlar da sıralamada, yönetici listesinde ve profilde gösterilirken temizlenir (boşalan ad `Oyuncu` olur, 15 karakterden uzun adlar reddedilmez, kesilir). Mevcut oyun kimliği ve doğru belirteçle yapılan tekrar denemeler yeni ad kuralları nedeniyle bozulmaz.

Skor önbelleği, veritabanı tetikleyicilerinin güncellediği sürümü kontrol eder. Başka Worker örneğindeki skor güncellemesi veya silme işleminden sonra eski sonuç önbellekten sunulmaz. `drizzle/0004_leaderboard_revision.sql` dahil tüm ekli migration dosyalarını Worker güncellemesinden önce uygula; önceki migration dosyalarını değiştirme.

## Bot incelemesi için hamle kayıtları

Doğrulanmış bir skor en az 100 puansa ve saklanan en yüksek 50 kayıt arasına girerse hamleleri `run_replays` tablosunda tutulur (en düşük skor önce silinir). Her kayıt en fazla 131072 bayt JSON'dur; daha büyükse yalnızca boyutu saklanır. Kayıtlar 30 gün sonra saatlik temizlikte ve sahibi ilgili oyunu sildiğinde silinir. `GET /api/admin/runs/:id/replay` yalnızca site sahibine açıktır ve oyuncu kimliğini döndürmez. Kayıt saklanamazsa skor kaydı yine de başarılı olur. `drizzle/0005_*.sql` migration dosyasını Worker güncellemesinden önce uygula.

## Kontroller

`npm run test:security` yetkilendirme, sahte skor, atomik kotalar (ortak misafir kovasının kimseyi kilitlememesi dahil), eski adların temizlenmesi, hamle kayıtları, trafik özeti, eski kayıt uyumluluğu, önbellek yarışları ve veritabanı sorgu sayısı testlerini çalıştırır. `npm run test:foods` yem kurallarını denetler. Testler geçici bellek veritabanı kullanır; canlı kayıtları değiştirmez.
