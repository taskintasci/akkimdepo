/**
 * Firestore API — window.DB
 *
 * Tüm Firestore okuma/yazma işlemleri buradan geçer.
 * onSnapshot listener'ları real-time güncelleme sağlar.
 */

import { db } from './firebase.js';
import { emit } from './events.js';

// ── Active Listeners ─────────────────────────────────────────────────────────
const _unsubs = [];

function _addUnsub(unsub) {
  _unsubs.push(unsub);
}

export function stopAllListeners() {
  _unsubs.forEach(fn => fn());
  _unsubs.length = 0;
}

// ── Bookings (Randevu) ───────────────────────────────────────────────────────

/** Belirli bir tarih için randevu verisini yükle (onSnapshot) */
export function watchBookings(dateStr, callback) {
  const unsub = db.collection('bookings').doc(dateStr)
    .onSnapshot(snap => {
      callback(snap.exists ? snap.data() : null);
    }, err => console.error('[DB] watchBookings:', err));

  _addUnsub(unsub);
  return unsub;
}

/** Tarih aralığı için randevu verilerini yükle */
export async function loadBookingsRange(startDate, endDate) {
  const snap = await db.collection('bookings')
    .where(firebase.firestore.FieldPath.documentId(), '>=', startDate)
    .where(firebase.firestore.FieldPath.documentId(), '<=', endDate)
    .get();

  const result = {};
  snap.forEach(doc => { result[doc.id] = doc.data(); });
  return result;
}

/** Randevu kaydet */
export async function saveBookingDate(dateStr, data) {
  await db.collection('bookings').doc(dateStr).set(data, { merge: true });
}

/** Randevu tek seferlik yükle */
export async function loadBookingDate(dateStr) {
  const snap = await db.collection('bookings').doc(dateStr).get();
  return snap.exists ? snap.data() : { adr: {}, normal: {} };
}

// ── Weekly Plan (Haftalık Plan) ──────────────────────────────────────────────

/** Haftalık plan verisini real-time izle */
export function watchWeeklyPlan(weekId, callback) {
  const unsub = db.collection('weeklyplan').doc(weekId)
    .onSnapshot(snap => {
      callback(snap.exists ? snap.data() : null);
    }, err => console.error('[DB] watchWeeklyPlan:', err));

  _addUnsub(unsub);
  return unsub;
}

/** Haftalık plan kaydet */
export async function saveWeeklyWeek(weekId, data) {
  await db.collection('weeklyplan').doc(weekId).set(data);
}

/** Haftalık plan yükle (tek seferlik) */
export async function loadWeeklyData(weekId) {
  const snap = await db.collection('weeklyplan').doc(weekId).get();
  return snap.exists ? snap.data() : null;
}

// ── Teyit ────────────────────────────────────────────────────────────────────

/** Teyit verisini real-time izle */
export function watchTeyit(dateStr, callback) {
  const unsub = db.collection('teyit').doc(dateStr)
    .onSnapshot(snap => {
      callback(snap.exists ? snap.data() : null);
    }, err => console.error('[DB] watchTeyit:', err));

  _addUnsub(unsub);
  return unsub;
}

/** Teyit kaydet */
export async function saveTeyitDay(dateStr, data) {
  await db.collection('teyit').doc(dateStr).set(data, { merge: true });
}

/** Teyit yükle (tek seferlik) */
export async function loadTeyitData(dateStr) {
  const snap = await db.collection('teyit').doc(dateStr).get();
  return snap.exists ? snap.data() : null;
}

// ── Persons (Personel) ───────────────────────────────────────────────────────

/** Personel listesini real-time izle */
export function watchPersons(callback) {
  const unsub = db.collection('config').doc('persons')
    .onSnapshot(snap => {
      const data = snap.exists ? (snap.data()?.list || []) : [];
      callback(data);
      emit('persons:updated', { list: data });
    }, err => console.error('[DB] watchPersons:', err));

  _addUnsub(unsub);
  return unsub;
}

/** Personel listesini yükle (tek seferlik) */
export async function loadPersons() {
  const snap = await db.collection('config').doc('persons').get();
  return snap.exists ? (snap.data()?.list || []) : [];
}

/** Personel listesini kaydet */
export async function savePersons(list) {
  await db.collection('config').doc('persons').set({ list });
  emit('persons:updated', { list });
}

// ── Auth Config ──────────────────────────────────────────────────────────────

/** Admin PIN hash'ini yükle */
export async function loadAuthConfig() {
  const snap = await db.collection('config').doc('auth').get();
  return snap.exists ? snap.data() : null;
}

/** Admin PIN hash'ini kaydet */
export async function saveAuthConfig(data) {
  await db.collection('config').doc('auth').set(data, { merge: true });
}

// ── SMTP Config ──────────────────────────────────────────────────────────────

/** SMTP ayarlarını yükle */
export async function loadSmtpConfig() {
  const snap = await db.collection('config').doc('smtp').get();
  return snap.exists ? snap.data() : null;
}

/** SMTP ayarlarını kaydet */
export async function saveSmtpConfig(data) {
  await db.collection('config').doc('smtp').set(data);
}

// ── Notes ────────────────────────────────────────────────────────────────────

/** Not verilerini real-time izle */
export function watchNotes(weekId, callback) {
  const unsub = db.collection('notes').doc(weekId)
    .onSnapshot(snap => {
      callback(snap.exists ? snap.data() : null);
    }, err => console.error('[DB] watchNotes:', err));

  _addUnsub(unsub);
  return unsub;
}

/** Not kaydet */
export async function saveNoteWeek(weekId, data) {
  await db.collection('notes').doc(weekId).set(data, { merge: true });
}

// ── Global DB API ────────────────────────────────────────────────────────────

window.DB = {
  // Bookings
  watchBookings,
  loadBookingsRange,
  saveBookingDate,

  // Weekly
  watchWeeklyPlan,
  saveWeeklyWeek,
  loadWeeklyData,

  // Teyit
  watchTeyit,
  saveTeyitDay,
  loadTeyitData,

  // Persons
  watchPersons,
  loadPersons,
  savePersons,

  // Config
  loadAuthConfig,
  saveAuthConfig,
  loadSmtpConfig,
  saveSmtpConfig,

  // Notes
  watchNotes,
  saveNoteWeek,

  // Cleanup
  stopAllListeners,
};
