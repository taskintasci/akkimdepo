/**
 * Slot üretim fonksiyonları — saf, state yok
 *
 * Mevcut projeden taşındı (randevu.js generateWorkSlots)
 */

export const WORK_START      = 8 * 60 + 30;   // 08:30
export const WORK_END        = 25 * 60;        // 01:00 ertesi gün
export const ADR_DURATION    = 90;             // dakika
export const NORMAL_DURATION = 75;

export const BREAKS = [
  [10*60,       10*60+15],   // 10:00–10:15
  [12*60,       13*60],      // 12:00–13:00
  [15*60,       15*60+15],   // 15:00–15:15
  [16*60+45,    17*60+15],   // 16:45–17:15
  [19*60+15,    20*60],      // 19:15–20:00
  [22*60,       22*60+15],   // 22:00–22:15
  [23*60+45,    24*60],      // 23:45–00:00
];

/**
 * İş günü slot listesini üret
 * @param {'adr'|'normal'} type
 * @returns {{ start: number, end: number }[]}
 */
export function generateWorkSlots(type) {
  const dur = type === 'adr' ? ADR_DURATION : NORMAL_DURATION;
  const slots = [];
  let t = WORK_START;

  while (t + dur <= WORK_END) {
    const bk = BREAKS.find(b => t < b[1] && t + dur > b[0]);
    if (bk) { t = bk[1]; continue; }

    slots.push({ start: t, end: t + dur });
    t += dur;

    const nb = BREAKS.find(b => b[0] === t);
    if (nb) t = nb[1];
  }

  return slots;
}

/** Dakika → "HH:MM" (gece yarısı sonrası destekli) */
export function toTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

/**
 * Slot geçmiş mi?
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {number} slotEnd dakika cinsinden
 */
export function isSlotPast(dateStr, slotEnd) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const slotDate = new Date(y, m-1, d);
  const today = new Date(); today.setHours(0,0,0,0);

  if (slotDate < today) return true;
  if (slotDate > today) return false;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const endReal = slotEnd > 1440 ? slotEnd - 1440 : slotEnd;
  if (slotEnd > 1440 && nowMin < 60) return false;
  return endReal <= nowMin;
}

// Önceden hesaplanmış slot listeleri
export const ADR_SLOTS    = generateWorkSlots('adr');
export const NORMAL_SLOTS = generateWorkSlots('normal');
