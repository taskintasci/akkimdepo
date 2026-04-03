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

// Dini tatiller — yıl bazlı (YYYY-MM-DD)
// 2025-2026 için öngörülen tarihler (güncellenmeli)
const DYNAMIC_HOLIDAYS = new Set([
  // Ramazan Bayramı 2025 (30 Mart - 1 Nisan)
  '2025-03-30', '2025-03-31', '2025-04-01',
  // Kurban Bayramı 2025 (5-9 Haziran)
  '2025-06-05', '2025-06-06', '2025-06-07', '2025-06-08', '2025-06-09',
  // Ramazan Bayramı 2026 (19-21 Mart)
  '2026-03-19', '2026-03-20', '2026-03-21',
  // Kurban Bayramı 2026 (25-29 Mayıs)
  '2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29',
]);

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
 * Tatil adını döndür (varsa)
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

  // Dini tatil kontrolü
  const y = dateStr.slice(0, 4);
  const ramazan2025 = ['2025-03-30','2025-03-31','2025-04-01'];
  const kurban2025  = ['2025-06-05','2025-06-06','2025-06-07','2025-06-08','2025-06-09'];
  const ramazan2026 = ['2026-03-19','2026-03-20','2026-03-21'];
  const kurban2026  = ['2026-05-25','2026-05-26','2026-05-27','2026-05-28','2026-05-29'];

  if (ramazan2025.includes(dateStr) || ramazan2026.includes(dateStr)) return 'Ramazan Bayramı';
  if (kurban2025.includes(dateStr) || kurban2026.includes(dateStr)) return 'Kurban Bayramı';

  return null;
}
