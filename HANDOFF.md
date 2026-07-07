# HANDOFF

## 2026-07-07 — Cloud Functions bölge konsolidasyonu + SMTP düzeltmesi

### Durum
Cloud Functions'lar iki bölgeye (`us-central1`, `europe-west1`) yayılmıştı çünkü `functions/index.js`'de hiçbir fonksiyonda `region` belirtilmiyordu — HTTPS callable fonksiyonlar varsayılan olarak `us-central1`'e, Firestore trigger'ı ise ayrı bir mantıkla farklı bir yere gidiyordu. Bu, Artifact Registry'de iki ayrı `gcf-artifacts` reposu (build image biriktiren) oluşturuyordu.

**Yapılan değişiklik:** Tüm 5 fonksiyona (`createAuthUser`, `deleteAuthUser`, `updateAuthUser`, `sendPasswordReset`, `teyitBildirimi`) `functions/index.js` içinde `region: 'europe-west1'` eklendi. `src/js/core/firebase.js`'deki client SDK da `firebase.app().functions('europe-west1')` olarak güncellendi (callable fonksiyonlar isimle çağrıldığı için frontend'de başka değişiklik gerekmedi).

Deploy edildi, `us-central1`'deki eski fonksiyonlar silindi. `us-central1/gcf-artifacts` reposu artık boş — kullanıcı şimdilik silmemeyi tercih etti (maliyeti yok).

**Artifact Registry cleanup policy** `europe-west1/gcf-artifacts` reposuna tanımlandı: 30 günden eski image'lar silinir, her fonksiyon için en az 3 en güncel versiyon her zaman korunur (rollback güvenliği).

### SMTP / e-posta bildirimi
`teyitBildirimi` fonksiyonu `535 Invalid login` hatası veriyordu — Gmail App Password eskimiş/geçersizdi. Yeni bir App Password oluşturulup Firestore `config/smtp.pass` alanına yazıldı (Firestore REST API üzerinden `updateMask` ile sadece `pass` alanı güncellendi, diğer alanlara dokunulmadı). Test edildi, mail anında gitti — log'da hata yok.

**Not:** Secret Manager'da kullanılmayan `MAIL_USER`/`MAIL_PASS` secret'ları var (muhtemelen eski/farklı bir kurulumdan kalma). Şu anki kod SMTP bilgisini Secret Manager'dan değil, Firestore `config/smtp` belgesinden okuyor. Bu secret'lar temizlenebilir ama şu an zararsız, dokunulmadı.

### Ortam notu
Bu makinede `gcloud` CLI yoktu, Homebrew ile kuruldu (`brew install --cask google-cloud-sdk`) ve `taskin.tasci@outlook.com` ile giriş yapıldı. `functions/node_modules/.bin/firebase-functions` çalıştırma izni eksikti (`EACCES`), `chmod +x` ile düzeltildi — muhtemelen `npm install` sonrası tekrar karşılaşılabilir, aynı şekilde düzeltilebilir.

### Kalanlar
- Yok — bu iş tamamlandı.
- (Opsiyonel, acil değil) Secret Manager'daki kullanılmayan `MAIL_USER`/`MAIL_PASS` secret'ları temizlenebilir.
- (Opsiyonel, acil değil) `us-central1/gcf-artifacts` boş reposu silinebilir.
