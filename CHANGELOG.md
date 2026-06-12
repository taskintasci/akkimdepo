# Changelog

---

## [2026-05-13]

### Düzeltildi
- Kurban Bayramı 2026 tarihleri 1 gün kaydırıldı (25-29 Mayıs → 26-30 Mayıs)
- Dark mode tatil/arife renkleri `!important` eksikliği nedeniyle light mode rengi gösteriyordu — giderildi

### Eklendi
- `isArife()` fonksiyonu — `FIXED_ARIFE` (MM-DD) ve `ARIFE_DAYS` (YYYY-MM-DD) setleri
- `FIXED_ARIFE`: 28 Ekim Cumhuriyet Bayramı Arifesi (sabit, her yıl)
- 2027 ve 2028 dini tatil tarihleri: Ramazan Bayramı ve Kurban Bayramı (arife dahil)
- Teyit modülü mini takviminde tatil/arife renklendirmesi (`isHoliday`, `isArife` import edildi)
- `haftalik.css`: tatil/arife hücreleri için hover renk koruması (`!important`)
- `dark.css`: tatil/arife için karanlık mod hover durumları

### Değiştirildi
- `getHolidayName()`: arife günleri "Arifesi" eki olmadan bayram adını döndürüyor (örn. "Kurban Bayramı")
- `DYNAMIC_HOLIDAYS`: arife günleri bu setten çıkarıldı, ayrı `ARIFE_DAYS` setine taşındı
