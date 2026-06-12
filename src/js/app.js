/**
 * App Entry Point
 *
 * Firebase Auth durumunu dinler → login veya launcher gösterir.
 * PIN modal tamamen kaldırıldı; kimlik doğrulama Firebase Auth üzerinden.
 */

import './core/storage.js';
import { on }                              from './core/events.js';
import { initAuth, getActiveUser }         from './core/auth.js';
import { initRouter, goToLogin,
         goToLauncher, goToApp }           from './core/router.js';
import { initLogin }                       from './modules/auth/login.js';
import { initLauncher, goToAppSelect }     from './modules/launcher/launcher.js';
import { init as initRandevu }             from './modules/randevu/randevu.js';
import { init as initHaftalik }            from './modules/haftalik/haftalik.js';
import { init as initTeyit }               from './modules/teyit/teyit.js';
import { watchPersons }                    from './core/storage.js';
import { getInitials, getAvatarColor }     from './utils/format.js';
import { startSession }                    from './utils/analytics.js';

// ── Theme Toggle ──────────────────────────────────────────────────────────────

function _initTheme() {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  _syncThemeIcon(btn);
  btn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('akkim-theme', isDark ? 'dark' : 'light');
    _syncThemeIcon(btn);
  });
}

function _syncThemeIcon(btn) {
  const isDark = document.documentElement.classList.contains('dark');
  if (isDark) {
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
    btn.title = 'Aydınlık moda geç';
    btn.setAttribute('aria-label', 'Aydınlık moda geç');
  } else {
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    btn.title = 'Karanlık moda geç';
    btn.setAttribute('aria-label', 'Karanlık moda geç');
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

const toastContainer = document.getElementById('toast-container');

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

on('user:changed', () => {
  _updateHeaderUser();
  const user = getActiveUser();
  if (user) startSession(user);
});

// ── Event Wiring ──────────────────────────────────────────────────────────────

on('router:go-appselect', () => {
  goToLauncher();
  goToAppSelect();
});

// ── Header scroll hide/show ───────────────────────────────────────────────────

const appHeader = document.getElementById('app-header');

if (appHeader) {
  const _sync = () => document.documentElement.style.setProperty('--app-header-h', appHeader.offsetHeight + 'px');
  _sync();
  new ResizeObserver(_sync).observe(appHeader);
}

let _ticking = false;
window.addEventListener('scroll', () => {
  if (_ticking) return;
  _ticking = true;
  requestAnimationFrame(() => {
    const hidden = window.scrollY > 60;
    appHeader?.classList.toggle('is-hidden', hidden);
    document.body.classList.toggle('header-hidden', hidden);
    _ticking = false;
  });
}, { passive: true });

// ── Init ──────────────────────────────────────────────────────────────────────

let _appModulesReady = false;

async function init() {
  _initTheme();
  initRouter();
  initLogin();

  // Firebase Auth durumunu dinle — ilk çağrıda redirect kararını ver
  initAuth((firebaseUser) => {
    if (firebaseUser) {
      // Firestore dinleyicileri ve modüller yalnızca giriş sonrası başlatılır
      if (!_appModulesReady) {
        _appModulesReady = true;
        watchPersons(() => {});
        initRandevu();
        initHaftalik();
        initTeyit();
      }
      goToLauncher();
      initLauncher().then(() => goToAppSelect());
    } else {
      initLogin();
      goToLogin();
    }
  });
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

window.App = { showToast };
