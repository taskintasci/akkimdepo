/**
 * Date utilities
 */

const TR_DAYS   = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const TR_DAYS_SHORT = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

/** "2024-03-15" → Date (local time) */
export function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date → "2024-03-15" */
export function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "2024-03-15" → "15 Mart 2024" */
export function formatDateLong(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2024-03-15" → "Cuma, 15 Mart" */
export function formatDateDisplay(dateStr) {
  const d = parseDate(dateStr);
  return `${TR_DAYS[d.getDay()]}, ${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
}

/** "2024-03-15" → "15 Mart" */
export function formatDateShort(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
}

/** Today → "2024-03-15" */
export function todayKey() {
  return formatDateKey(new Date());
}

/** Date → "2024-W11" (ISO week) */
export function getWeekId(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Perşembe'ye göre ISO hafta hesabı
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** "2024-W11" → Pazartesi Date */
export function weekIdToMonday(weekId) {
  const [yearStr, wStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(wStr, 10);

  // ISO week 1: ilk Perşembe'yi içeren hafta
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - jan4Day + 1 + (week - 1) * 7);
  return monday;
}

/** Haftanın 5 iş günü tarihlerini döndür ["2024-03-11", ..., "2024-03-15"] */
export function getWeekDays(weekId) {
  const monday = weekIdToMonday(weekId);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return formatDateKey(d);
  });
}

/** "2024-W11" → "11-17 Mart 2024" (hafta başlığı) */
export function formatWeekTitle(weekId) {
  const days = getWeekDays(weekId);
  const first = parseDate(days[0]);
  const last  = parseDate(days[6]);

  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()}–${last.getDate()} ${TR_MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  }
  return `${first.getDate()} ${TR_MONTHS[first.getMonth()]} – ${last.getDate()} ${TR_MONTHS[last.getMonth()]} ${first.getFullYear()}`;
}

/** Gün kısa ismi: "2024-03-11" → "Pzt" */
export function getDayShortName(dateStr) {
  return TR_DAYS_SHORT[parseDate(dateStr).getDay()];
}

/** Gün tam ismi: "2024-03-11" → "Pazartesi" */
export function getDayName(dateStr) {
  return TR_DAYS[parseDate(dateStr).getDay()];
}

/** Bugün mü? */
export function isToday(dateStr) {
  return dateStr === todayKey();
}

/** İş günü mü (Pzt-Cuma)? */
export function isWorkday(dateStr) {
  const day = parseDate(dateStr).getDay();
  return day >= 1 && day <= 5;
}

/** dateStr'i n gün kaydır */
export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDateKey(d);
}

/** Bir önceki/sonraki hafta weekId'si */
export function prevWeek(weekId) {
  const monday = weekIdToMonday(weekId);
  monday.setDate(monday.getDate() - 7);
  return getWeekId(monday);
}

export function nextWeek(weekId) {
  const monday = weekIdToMonday(weekId);
  monday.setDate(monday.getDate() + 7);
  return getWeekId(monday);
}

/** Bir önceki/sonraki ay */
export function prevMonth(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth(year, month) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Aydaki tüm günler */
export function getMonthDays(year, month) {
  const days = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    days.push(formatDateKey(new Date(date)));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

/** Ay adı */
export function getMonthName(month) {
  return TR_MONTHS[month - 1];
}

/** Geçerli weekId */
export function currentWeekId() {
  return getWeekId(new Date());
}

/** Date → ISO hafta numarası (1-53) */
export function getWeekNumber(date) {
  return parseInt(getWeekId(date).split('-W')[1], 10);
}
