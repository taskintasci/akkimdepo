/**
 * Typed Event Bus — modüller arası iletişim
 *
 * Kullanım:
 *   import { emit, on, off } from './events.js';
 *
 *   on('booking:created', (data) => { ... });
 *   emit('booking:created', { date, type, idx });
 *
 * Event Listesi:
 *   booking:created   → { date, type, idx, data }       randevu kaydedildi
 *   booking:deleted   → { date, type, idx }              randevu silindi
 *   weekly:changed    → { week, data }                   haftalık plan güncellendi
 *   weekly:entry:add  → { week, personId, day, entry }   yeni entry eklendi
 *   teyit:added       → { date, item }                   teyite yeni araç eklendi
 *   teyit:stage       → { date, id, stage }              araç aşama değiştirdi
 *   teyit:wms         → { item }                         WMS için randevu al tıklandı
 *   persons:updated   → { list }                         personel listesi güncellendi
 *   user:changed      → { user }                         aktif kullanıcı değişti
 *   auth:changed      → { isAdmin }                      admin durumu değişti
 *   notes:changed     → { week, data }                   notlar güncellendi
 */

const listeners = new Map();

/**
 * @param {string} event
 * @param {Function} handler
 * @returns {() => void} unsubscribe function
 */
export function on(event, handler) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(handler);

  return () => off(event, handler);
}

/**
 * @param {string} event
 * @param {Function} handler
 */
export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

/**
 * @param {string} event
 * @param {*} data
 */
export function emit(event, data) {
  if (!listeners.has(event)) return;
  for (const handler of listeners.get(event)) {
    try {
      handler(data);
    } catch (err) {
      console.error(`[events] ${event} handler hatası:`, err);
    }
  }
}

/**
 * Sadece bir kez tetiklenen listener
 * @param {string} event
 * @param {Function} handler
 */
export function once(event, handler) {
  const wrapper = (data) => {
    handler(data);
    off(event, wrapper);
  };
  return on(event, wrapper);
}
