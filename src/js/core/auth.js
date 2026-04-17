/**
 * Auth — kullanıcı session ve admin PIN yönetimi
 *
 * Admin PIN: SHA-256 hash Firestore'da config/auth → { adminPin: "<hex>" }
 * Kullanıcı: LocalStorage'da session kalıcılığı
 */

import { emit } from './events.js';
import { loadAuthConfig, saveAuthConfig } from './storage.js';
import { getIsAdmin, setIsAdmin, clearActiveUser } from '../utils/storage-local.js';

// ── Role Normalization ───────────────────────────────────────────────────────
/**
 * Normalize user role to standard format
 * @param {string} role
 * @returns {'admin'|'wms'|'normal'|'guest'}
 */
export function normalizeRole(role) {
  if (!role || typeof role !== 'string') return 'normal';
  const normalized = role.toLowerCase().trim();
  if (normalized === 'admin' || normalized === 'yönetici') return 'admin';
  if (normalized === 'wms' || normalized === 'wms_operator' || normalized === 'wms operatör') return 'wms';
  if (normalized === 'guest' || normalized === 'konuk') return 'guest';
  return 'normal';
}

let _isAdmin = false;
let _activeUser = null;

// ── SHA-256 ──────────────────────────────────────────────────────────────────

async function sha256hex(text) {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── PIN doğrulama ────────────────────────────────────────────────────────────

/**
 * PIN'i doğrula
 * @param {string} pin
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin) {
  const config = await loadAuthConfig();

  if (!config?.adminPin) {
    // İlk kurulum: PIN henüz ayarlanmamış, varsayılan "Admin"
    const defaultHash = await sha256hex('Admin');
    const inputHash = await sha256hex(pin);
    return inputHash === defaultHash;
  }

  const inputHash = await sha256hex(pin);
  return inputHash === config.adminPin;
}

/**
 * Yeni PIN ayarla (mevcut PIN doğrulandıktan sonra)
 * @param {string} newPin
 */
export async function setAdminPin(newPin) {
  const hash = await sha256hex(newPin);
  await saveAuthConfig({ adminPin: hash });
}

// ── Admin session ────────────────────────────────────────────────────────────

export function getIsAdminSession() {
  return _isAdmin;
}

export function setAdminSession(value) {
  _isAdmin = value;
  setIsAdmin(value);
  emit('auth:changed', { isAdmin: value });
}

/** Admin oturumunu kapat */
export function logoutAdmin() {
  setAdminSession(false);
}

// ── User session ─────────────────────────────────────────────────────────────

export function getActiveUser() {
  return _activeUser;
}

/**
 * Kullanıcı seç
 * @param {{ id, name, role, avatar }} user
 */
export function setActiveUser(user) {
  _activeUser = user;
  emit('user:changed', { user });
}

/** Kullanıcı oturumunu kapat */
export function clearUser() {
  _activeUser = null;
  _isAdmin = false;
  clearActiveUser();
  emit('user:changed', { user: null });
  emit('auth:changed', { isAdmin: false });
}

// ── Init ─────────────────────────────────────────────────────────────────────

/**
 * LocalStorage'dan admin durumunu geri yükle.
 * Kullanıcı seçimi launcher tarafından yönetilir.
 */
export function initAuth() {
  _isAdmin = getIsAdmin();
}
