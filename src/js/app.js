/**
 * App Entry Point
 *
 * Uygulama başlatma, modal yönetimi ve global event wiring.
 */

import './core/storage.js';
import { on }             from './core/events.js';
import { initAuth, verifyPin, setAdminSession, getActiveUser } from './core/auth.js';
import { initRouter, goToLauncher, goToApp }   from './core/router.js';
import { initLauncher, goToAppSelect } from './modules/launcher/launcher.js';
import { init as initRandevu } from './modules/randevu/randevu.js';
import { init as initHaftalik } from './modules/haftalik/haftalik.js';
import { init as initTeyit }    from './modules/teyit/teyit.js';
import { watchPersons }   from './core/storage.js';
import { getInitials, getAvatarColor } from './utils/format.js';

// ── Toast ─────────────────────────────────────────────────────────────────────

const toastContainer = document.getElementById('toast-container');
let _toastTimer = null;

/**
 * Toast bildirimi göster
 * @param {{ title: string, desc?: string, type?: 'default'|'success'|'error'|'warning'|'info'|'sync', duration?: number }} opts
 */
export function showToast({ title, desc = '', type = 'default', duration = 3500 }) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <div class="toast__content">
      <div class="toast__title">${_esc(title)}</div>
      ${desc ? `<div class="toast__desc">${_esc(desc)}</div>` : ''}
    </div>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('is-hiding');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => { if (toast.isConnected) toast.remove(); }, 500);
  }, duration);
}

// ── PIN Modal ─────────────────────────────────────────────────────────────────

const modalPin    = document.getElementById('modal-pin');
const inputPin    = document.getElementById('input-pin');
const pinError    = document.getElementById('pin-error');
const btnPinClose  = document.getElementById('btn-pin-close');
const btnPinCancel = document.getElementById('btn-pin-cancel');
const btnPinSubmit = document.getElementById('btn-pin-submit');

export function openPinModal() {
  inputPin.value = '';
  pinError.hidden = true;
  modalPin.hidden = false;
  requestAnimationFrame(() => {
    modalPin.classList.add('is-open');
    inputPin.focus();
  });
}

function closePinModal() {
  modalPin.classList.remove('is-open');
  const hide = () => { modalPin.hidden = true; };
  modalPin.addEventListener('transitionend', hide, { once: true });
  setTimeout(hide, 300); // fallback: transition bazen tetiklenmez
}

async function submitPin() {
  const pin = inputPin.value.trim();
  if (!pin) return;

  btnPinSubmit.disabled = true;
  btnPinSubmit.textContent = 'Doğrulanıyor...';

  const ok = await verifyPin(pin);

  if (ok) {
    setAdminSession(true);
    closePinModal();
    showToast({ title: 'Admin girişi yapıldı', type: 'success' });
    _updateHeaderUser();
  } else {
    pinError.hidden = false;
    inputPin.classList.add('animate-shake');
    inputPin.addEventListener('animationend', () => {
      inputPin.classList.remove('animate-shake');
    }, { once: true });
    inputPin.select();
  }

  btnPinSubmit.disabled = false;
  btnPinSubmit.textContent = 'Giriş Yap';
}

btnPinClose?.addEventListener('click', closePinModal);
btnPinCancel?.addEventListener('click', closePinModal);
btnPinSubmit?.addEventListener('click', submitPin);

inputPin?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitPin();
  pinError.hidden = true;
});

// Backdrop click to close
modalPin?.addEventListener('click', (e) => {
  if (e.target === modalPin) closePinModal();
});

// ── Header User Chip ──────────────────────────────────────────────────────────

function _updateHeaderUser() {
  const headerUser = document.getElementById('header-user');
  if (!headerUser) return;

  const user = getActiveUser();
  if (!user) { headerUser.innerHTML = ''; return; }

  const initials = getInitials(user.name);
  const color    = getAvatarColor(user.name);

  headerUser.innerHTML = `
    <span class="avatar avatar--sm" data-color="${color}" aria-hidden="true">${initials}</span>
    <span class="text-sm font-medium">${_esc(user.name)}</span>
  `;
}

on('user:changed', _updateHeaderUser);

// ── Event Wiring ──────────────────────────────────────────────────────────────

on('router:go-launcher', () => {
  goToLauncher();
  initLauncher();
});

on('router:go-appselect', () => {
  goToLauncher();
  goToAppSelect();
});

// ── Init ──────────────────────────────────────────────────────────────────────

const appHeader = document.getElementById('app-header');

// Header yüksekliğini CSS değişkenine yaz (sticky th top için)
if (appHeader) {
  const _sync = () => document.documentElement.style.setProperty('--app-header-h', appHeader.offsetHeight + 'px');
  _sync();
  new ResizeObserver(_sync).observe(appHeader);
}

// Header scroll'da otomatik gizle/göster — sadece en üstte açılır
let _ticking = false;

window.addEventListener('scroll', () => {
  if (_ticking) return;
  _ticking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY;
    const atTop = y < 8;
    if (atTop) {
      appHeader?.classList.remove('is-hidden');
      document.body.classList.remove('header-hidden');
    } else {
      appHeader?.classList.add('is-hidden');
      document.body.classList.add('header-hidden');
    }
    _ticking = false;
  });
}, { passive: true });

async function init() {
  initAuth();
  initRouter();

  // Personel listesini real-time dinle
  watchPersons(() => {});

  // Modülleri başlat
  initRandevu();
  initHaftalik();
  initTeyit();

  // Launcher'ı başlat
  await initLauncher();
}

init().catch(err => {
  console.error('[App] Başlatma hatası:', err);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Global erişim (modüller arası)
window.App = { showToast, openPinModal };
