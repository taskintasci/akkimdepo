/**
 * Analytics — oturum izleme ve aktivite logu
 *
 * Firestore koleksiyonları:
 *   analytics_sessions  — kullanıcı oturumları
 *   analytics_activity  — kullanıcı eylemleri
 */

import { db } from '../core/firebase.js';
import { getWeekId } from './date.js';

let _sessionRef       = null;
let _sessionStart     = null;
let _lastEndWrite     = 0;
let _listenersSet     = false;
const MIN_WRITE_GAP   = 30_000; // 30 saniye — visibilitychange spam yazmasın

// ── Oturum ────────────────────────────────────────────────────────────────────

export async function startSession(user) {
  if (!user || !db) return;
  if (_sessionRef) { _endSession(); }

  _sessionStart = Date.now();
  const today  = new Date().toISOString().split('T')[0];
  const weekId = getWeekId(new Date());

  try {
    _sessionRef = db.collection('analytics_sessions').doc();
    await _sessionRef.set({
      userId:    user.id,
      userName:  user.name,
      date:      today,
      weekId,
      startedAt: firebase.firestore.FieldValue.serverTimestamp(),
      duration:  0,
    });
  } catch (e) {
    _sessionRef = null;
    console.warn('[Analytics] startSession:', e);
    return;
  }

  if (!_listenersSet) {
    _listenersSet = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') _endSession();
    });
    window.addEventListener('beforeunload', _endSession);
  }
}

function _endSession() {
  if (!_sessionRef || !_sessionStart) return;
  const now = Date.now();
  if (now - _lastEndWrite < MIN_WRITE_GAP) return;
  _lastEndWrite = now;
  const duration = Math.round((now - _sessionStart) / 1000);
  _sessionRef.update({ duration }).catch(() => {});
}

// ── Aktivite logu ─────────────────────────────────────────────────────────────

export async function logActivity(user, action, details = '') {
  if (!user || !db) return;
  try {
    await db.collection('analytics_activity').add({
      userId:   user.id,
      userName: user.name,
      action,
      details,
      weekId:   getWeekId(new Date()),
      ts:       firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[Analytics] logActivity:', e);
  }
}

// ── Okuma ─────────────────────────────────────────────────────────────────────

export async function loadWeekStats(weekId) {
  try {
    const snap = await db.collection('analytics_sessions')
      .where('weekId', '==', weekId)
      .get();

    let visits = 0, totalDuration = 0;
    const uniqueUsers = new Set();

    snap.forEach(doc => {
      const d = doc.data();
      visits++;
      totalDuration += d.duration || 0;
      uniqueUsers.add(d.userId);
    });

    return { visits, totalDuration, uniqueUsers: uniqueUsers.size };
  } catch (e) {
    console.warn('[Analytics] loadWeekStats:', e);
    return { visits: 0, totalDuration: 0, uniqueUsers: 0 };
  }
}

export async function loadActivityLog(limit = 60) {
  try {
    const snap = await db.collection('analytics_activity')
      .orderBy('ts', 'desc')
      .limit(limit)
      .get();

    const items = [];
    snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    return items;
  } catch (e) {
    console.warn('[Analytics] loadActivityLog:', e);
    return [];
  }
}

// ── Format yardımcıları ───────────────────────────────────────────────────────

export function fmtDuration(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}sn`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}s ${m}dk`;
  return `${m}dk`;
}

export function timeAgo(ts) {
  if (!ts) return '';
  const d    = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.round((Date.now() - d) / 1000);
  if (diff < 60)    return 'Az önce';
  if (diff < 3600)  return `${Math.floor(diff / 60)}dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}s önce`;
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'Bugün';
  if (d.toDateString() === yesterday.toDateString()) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}
