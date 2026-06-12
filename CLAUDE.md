# Akkim Plan — Proje Rehberi

Lojistik operasyonlar için randevu, haftalık planlama ve araç teyit yönetim uygulaması.

---

## Tech Stack

- **Frontend:** Vanilla JS (ES6 modülleri) — build tool yok, doğrudan tarayıcı
- **Backend:** Firebase Firestore (gerçek zamanlı) + Cloud Functions (Node 20)
- **CSS:** Vanilla CSS, tasarım token sistemi
- **Hosting:** Firebase Hosting (statik)
- **E-posta:** Cloud Functions + Nodemailer (teyit bildirimleri)

---

## Proje Yapısı

```
akkim-plan-modern_v5/
├── index.html                  SPA giriş noktası
├── functions/                  Cloud Functions (e-posta bildirimleri)
│   └── index.js
├── src/
│   ├── js/
│   │   ├── app.js              Uygulama başlatıcı, tema, PIN modal, toast
│   │   ├── core/
│   │   │   ├── auth.js         Kullanıcı oturumu, PIN doğrulama (SHA-256)
│   │   │   ├── events.js       Modüller arası pub/sub event bus
│   │   │   ├── firebase.js     Firebase başlatma ve Firestore export
│   │   │   ├── router.js       Ekran ve görünüm yönlendirme
│   │   │   └── storage.js      Firestore CRUD ve gerçek zamanlı dinleyiciler
│   │   ├── modules/
│   │   │   ├── launcher/       Kullanıcı seçimi ve uygulama başlatıcı
│   │   │   ├── randevu/        Aylık takvim, slot yönetimi, sürükle-bırak
│   │   │   ├── haftalik/       Kişi×Gün tablosu, aylık özet, Excel export
│   │   │   └── teyit/          3 aşamalı araç teyit workflow'u
│   │   └── utils/
│   │       ├── analytics.js    Oturum ve aktivite takibi
│   │       ├── date.js         Türkçe tarih yardımcıları, hafta ID
│   │       ├── format.js       Plaka, konteyner, araç tipi formatları
│   │       ├── holidays.js     Türkiye resmi tatil ve arife günleri
│   │       ├── parser.js       Yapıştırma metninden plaka/konteyner çekme
│   │       └── storage-local.js LocalStorage yardımcıları (akkim_ öneki)
│   └── styles/
│       ├── tokens.css          Tasarım token'ları (renkler, boşluklar, tipografi)
│       ├── reset.css
│       ├── typography.css
│       ├── layout.css
│       ├── animations.css
│       ├── dark.css            Karanlık mod override'ları (en son yüklenir)
│       └── components/         14 bileşen CSS dosyası
```

---

## Modüller

### launcher
Kullanıcı seçim ekranı (personel grid'i) → uygulama seçimi (3 kart: Randevu, Haftalık Plan, Teyit) → admin personel yönetimi. Firestore'dan personel listesi çeker.

### randevu
Aylık takvim görünümü. ADR (90 dk) ve Normal (75 dk) slot'lar, 08:30–01:00 arası çalışma. Sürükle-bırak, toplu yapıştırma (plaka/konteyner), tatil renklendirmesi.

### haftalik
Kişi × Gün tablosu (Pzt–Paz, 7 gün). Giriş chip'leri (IMO'lu, IMO'suz, İthalat, Diğer), aylık özet modal, Excel export (SheetJS CDN), tatil/arife sütun renklendirmesi.

### teyit
Günlük araç doğrulama. 3 aşama: Bekliyor → Teyit Edildi → WMS İşlendi. Takvim navigasyonu, haftalık plandan veri çekme, WMS slot seçimi, mini takvimde tatil renklendirmesi.

---

## Core

### events.js
`emit(event, data)` / `on(event, fn)` / `off(event, fn)` / `once(event, fn)` ile çalışan basit pub/sub sistemi. Modüller birbirini doğrudan import etmez, event bus üzerinden haberleşir.

### storage.js
Firestore koleksiyonları:

| Koleksiyon | İçerik |
|---|---|
| `bookings/{date}` | Randevu verileri |
| `weeklyplan/{week}` | Haftalık plan (2024-W11 formatı) |
| `teyit/{date}` | Günlük teyit kayıtları |
| `notes/{week}` | Haftalık notlar |
| `persons/{id}` | Personel listesi |
| `config/auth` | Admin PIN hash |
| `config/smtp` | E-posta ayarları |
| `analytics_sessions` | Oturum kayıtları |
| `analytics_activity` | Aktivite logları |

### auth.js
Roller: `admin`, `wms`, `normal`, `guest`. PIN doğrulama SHA-256 ile yapılır. Oturum LocalStorage'da tutulur.

---

## CSS Mimarisi

### Yükleme Sırası
`tokens.css` → `reset.css` → `typography.css` → `layout.css` → `animations.css` → `components/*.css` → `modules/*.css` → **`dark.css`**

`dark.css` her zaman en son yüklenir ve tüm bileşen stillerinin üstüne yazar.

### Tasarım Token'ları
Renkler, boşluklar, gölgeler `tokens.css`'de CSS değişkeni olarak tanımlanır. Bileşenler bu değişkenleri kullanır, ham değer kullanılmaz.

### Dark Mode Kuralı — Kritik
Bileşen CSS'inde `!important` kullanan bir kural varsa, `dark.css`'deki override'ı da `!important` ile yazılmalıdır. Aksi hâlde dark mode override çalışmaz.

```css
/* haftalik.css — !important var */
.day-cell.col-holiday { background: var(--amber-50) !important; }

/* dark.css — !important zorunlu */
html.dark .day-cell.col-holiday { background: rgba(251, 191, 36, 0.08) !important; }
```

Her modülün CSS'i (`randevu.css`, `haftalik.css`, `teyit.css`) modül klasöründe yaşar. Genel bileşen stilleri `src/styles/components/` altındadır.

---

## Kodlama Kuralları

- **Yorum yok** — yalnızca neden'i açık olmayan durumlarda kısa yorum
- **UI metinleri Türkçe** — tüm kullanıcıya görünen metin Türkçedir
- **Modül yapısı** — her modül kendi `.js` + `.css` çiftiyle gelir
- **Build tool yok** — native ES6 `import/export`, CDN dışında paket kullanılmaz
- **Vanilla CSS** — framework veya preprocessor kullanılmaz, token'lar yeterli
