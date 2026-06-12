/**
 * LocalStorage helpers — kullanıcı tercihleri ve session kalıcılığı
 */

const PREFIX = 'akkim_';

function key(k) { return `${PREFIX}${k}`; }

/** Değer kaydet */
export function lsSet(k, value) {
  try {
    localStorage.setItem(key(k), JSON.stringify(value));
  } catch (e) {
    console.warn('[localStorage] set failed:', e);
  }
}

/** Değer oku */
export function lsGet(k, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key(k));
    return raw !== null ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

/** Değer sil */
export function lsDel(k) {
  try {
    localStorage.removeItem(key(k));
  } catch (e) {}
}

// ── Tipli yardımcılar ────────────────────────────────────────────────────────

/** Aktif kullanıcı ID'si */
export function getActiveUserId() {
  return lsGet('active_user_id');
}

export function setActiveUserId(id) {
  lsSet('active_user_id', id);
}

export function clearActiveUser() {
  lsDel('active_user_id');
  lsDel('is_admin');
}

/** Admin durumu */
export function getIsAdmin() {
  return lsGet('is_admin', false);
}

export function setIsAdmin(v) {
  lsSet('is_admin', v);
}

/** Son görüntülenen view */
export function getLastView() {
  return lsGet('last_view', 'haftalik');
}

export function setLastView(view) {
  lsSet('last_view', view);
}

/** Son görüntülenen hafta */
export function getLastWeek() {
  return lsGet('last_week', null);
}

export function setLastWeek(weekId) {
  lsSet('last_week', weekId);
}

/** Son görüntülenen randevu tarihi */
export function getLastRandevuDate() {
  return lsGet('last_randevu_date', null);
}

export function setLastRandevuDate(dateStr) {
  lsSet('last_randevu_date', dateStr);
}

/** Son görüntülenen teyit tarihi */
export function getLastTeyitDate() {
  return lsGet('last_teyit_date', null);
}

export function setLastTeyitDate(dateStr) {
  lsSet('last_teyit_date', dateStr);
}
