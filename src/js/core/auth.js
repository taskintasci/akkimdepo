/**
 * Auth — Firebase Authentication wrapper
 *
 * Rol hiyerarşisi: admin > wms > normal > guest
 * Roller Firebase Custom Claims üzerinde taşınır: { role: 'admin'|'wms'|'normal' }
 */

import { auth } from './firebase.js';
import { emit } from './events.js';

let _activeUser = null;
let _isAdmin    = false;

// ── Auth state listener ───────────────────────────────────────────────────────

/**
 * Firebase Auth durumunu dinle.
 * @param {(firebaseUser: firebase.User|null) => void} onReady - ilk durum belirlendikten sonra çağrılır
 */
export function initAuth(onReady) {
  auth.onAuthStateChanged(async (firebaseUser) => {
    if (firebaseUser) {
      const tokenResult = await firebaseUser.getIdTokenResult();
      const role = tokenResult.claims.role || 'normal';
      _isAdmin = role === 'admin';

      _activeUser = {
        uid:   firebaseUser.uid,
        id:    firebaseUser.uid,
        name:  firebaseUser.displayName || firebaseUser.email,
        email: firebaseUser.email,
        role,
      };

      emit('user:changed',  { user: _activeUser });
      emit('auth:changed',  { isAdmin: _isAdmin });
    } else {
      _activeUser = null;
      _isAdmin    = false;
      emit('user:changed', { user: null });
      emit('auth:changed', { isAdmin: false });
    }

    if (onReady) onReady(firebaseUser);
  });
}

// ── Getters ───────────────────────────────────────────────────────────────────

export function getActiveUser()      { return _activeUser; }
export function getIsAdminSession()  { return _isAdmin; }

// ── Sign out ──────────────────────────────────────────────────────────────────

export function clearUser() {
  auth.signOut();
}

// ── Role helpers ──────────────────────────────────────────────────────────────

export function normalizeRole(role) {
  if (!role || typeof role !== 'string') return 'normal';
  const r = role.toLowerCase().trim();
  if (r === 'admin' || r === 'yönetici')                              return 'admin';
  if (r === 'wms'   || r === 'wms_operator' || r === 'wms operatör') return 'wms';
  if (r === 'guest' || r === 'konuk')                                 return 'guest';
  return 'normal';
}

/**
 * Mevcut kullanıcının token'ını yenile (custom claim güncellemesinden sonra çağrılır).
 */
export async function refreshToken() {
  const user = auth.currentUser;
  if (user) await user.getIdToken(true);
}
