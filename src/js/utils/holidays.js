/**
 * Türkiye resmi tatilleri
 *
 * Format: "MM-DD" → sabit tatiller
 * Dini tatiller yıla göre değişir (manuel güncelleme gerekir)
 */

// Sabit resmi tatiller (MM-DD)
const FIXED_HOLIDAYS = new Set([
  '01-01', // Yılbaşı
  '04-23', // Ulusal Egemenlik ve Çocuk Bayramı
  '05-01', // Emek ve Dayanışma Günü
  '05-19', // Atatürk'ü Anma, Gençlik ve Spor Bayramı
  '07-15', // Demokrasi ve Millî Birlik Günü
  '08-30', // Zafer Bayramı
  '10-29', // Cumhuriyet Bayramı
]);

// Sabit arife günleri — yarım gün çalışma (MM-DD)
const FIXED_ARIFE = new Set([
  '10-28', // Cumhuriyet Bayramı Arifesi
]);

// Dini bayram arifeleri — yıl bazlı (YYYY-MM-DD)
const ARIFE_DAYS = new Set([
  '2025-03-29', // Ramazan Bayramı Arifesi 2025
  '2025-06-05', // Kurban Bayramı Arifesi 2025
  '2026-03-18', // Ramazan Bayramı Arifesi 2026
  '2026-05-26', // Kurban Bayramı Arifesi 2026
  '2027-03-08', // Ramazan Bayramı Arifesi 2027
  '2027-05-15', // Kurban Bayramı Arifesi 2027
  '2028-02-26', // Ramazan Bayramı Arifesi 2028
  '2028-05-04', // Kurban Bayramı Arifesi 2028
]);

// Dini tatiller — yıl bazlı (YYYY-MM-DD), arife hariç
const DYNAMIC_HOLIDAYS = new Set([
  // Ramazan Bayramı 2025 (30 Mart - 1 Nisan)
  '2025-03-30', '2025-03-31', '2025-04-01',
  // Kurban Bayramı 2025 (6-9 Haziran)
  '2025-06-06', '2025-06-07', '2025-06-08', '2025-06-09',
  // Ramazan Bayramı 2026 (19-21 Mart)
  '2026-03-19', '2026-03-20', '2026-03-21',
  // Kurban Bayramı 2026 (27-30 Mayıs)
  '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30',
  // Ramazan Bayramı 2027 (9-11 Mart)
  '2027-03-09', '2027-03-10', '2027-03-11',
  // Kurban Bayramı 2027 (16-19 Mayıs)
  '2027-05-16', '2027-05-17', '2027-05-18', '2027-05-19',
  // Ramazan Bayramı 2028 (27 Şubat - 1 Mart)
  '2028-02-27', '2028-02-28', '2028-02-29',
  // Kurban Bayramı 2028 (5-8 Mayıs)
  '2028-05-05', '2028-05-06', '2028-05-07', '2028-05-08',
]);

/**
 * Verilen tarih arife günü mü? (yarım gün çalışma)
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isArife(dateStr) {
  if (!dateStr) return false;
  const mmdd = dateStr.slice(5);
  return FIXED_ARIFE.has(mmdd) || ARIFE_DAYS.has(dateStr);
}

/**
 * Verilen tarih resmi tatil mi?
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isHoliday(dateStr) {
  if (!dateStr) return false;
  const mmdd = dateStr.slice(5); // "MM-DD"
  return FIXED_HOLIDAYS.has(mmdd) || DYNAMIC_HOLIDAYS.has(dateStr);
}

/**
 * Verilen tarih iş günü mü? (Hafta içi + tatil değil)
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isBusinessDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  if (day === 0 || day === 6) return false; // hafta sonu
  return !isHoliday(dateStr);
}

/**
 * Tatil/arife adını döndür (varsa)
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {string|null}
 */
export function getHolidayName(dateStr) {
  if (!dateStr) return null;
  const mmdd = dateStr.slice(5);

  const fixedNames = {
    '01-01': 'Yılbaşı',
    '04-23': 'Ulusal Egemenlik ve Çocuk Bayramı',
    '05-01': 'İşçi Bayramı',
    '05-19': 'Gençlik ve Spor Bayramı',
    '07-15': 'Demokrasi Bayramı',
    '08-30': 'Zafer Bayramı',
    '10-29': 'Cumhuriyet Bayramı',
  };

  if (fixedNames[mmdd]) return fixedNames[mmdd];

  // Arife kontrolü (bayram adından önce)
  if (FIXED_ARIFE.has(mmdd)) {
    if (mmdd === '10-28') return 'Cumhuriyet Bayramı';
  }
  if (ARIFE_DAYS.has(dateStr)) {
    const ramazanArifeleri = ['2025-03-29','2026-03-18','2027-03-08','2028-02-26'];
    const kurbanArifeleri  = ['2025-06-05','2026-05-26','2027-05-15','2028-05-04'];
    if (ramazanArifeleri.includes(dateStr)) return 'Ramazan Bayramı';
    if (kurbanArifeleri.includes(dateStr))  return 'Kurban Bayramı';
  }

  // Dini tatil kontrolü
  const ramazanGunleri = [
    '2025-03-30','2025-03-31','2025-04-01',
    '2026-03-19','2026-03-20','2026-03-21',
    '2027-03-09','2027-03-10','2027-03-11',
    '2028-02-27','2028-02-28','2028-02-29',
  ];
  const kurbanGunleri = [
    '2025-06-06','2025-06-07','2025-06-08','2025-06-09',
    '2026-05-27','2026-05-28','2026-05-29','2026-05-30',
    '2027-05-16','2027-05-17','2027-05-18','2027-05-19',
    '2028-05-05','2028-05-06','2028-05-07','2028-05-08',
  ];

  if (ramazanGunleri.includes(dateStr)) return 'Ramazan Bayramı';
  if (kurbanGunleri.includes(dateStr))  return 'Kurban Bayramı';

  return null;
}
