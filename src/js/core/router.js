/**
 * Router — uygulama içi ekran ve view yönetimi
 *
 * Screens: launcher ↔ app
 * Views:   randevu | haftalik | teyit
 */

import { emit } from './events.js';
import { getLastView, setLastView } from '../utils/storage-local.js';

const screens = {
  launcher: document.getElementById('screen-launcher'),
  app:      document.getElementById('screen-app'),
};

const views = {
  randevu:  document.getElementById('view-randevu'),
  haftalik: document.getElementById('view-haftalik'),
  teyit:    document.getElementById('view-teyit'),
};

const appHeader  = document.getElementById('app-header');
const appNav     = document.getElementById('app-nav');
const mobileNav  = document.getElementById('mobile-nav');

let _currentScreen = 'launcher';
let _currentView   = 'haftalik';

// ── Screen ───────────────────────────────────────────────────────────────────

export function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => {
    if (!el) return;
    el.hidden = (k !== name);
  });

  if (appHeader) appHeader.hidden = (name === 'launcher');
  _currentScreen = name;
}

export function getCurrentScreen() {
  return _currentScreen;
}

// ── View ─────────────────────────────────────────────────────────────────────

export function showView(name) {
  if (!views[name]) return;

  Object.entries(views).forEach(([k, el]) => {
    if (!el) return;
    el.hidden = (k !== name);
  });

  _currentView = name;
  setLastView(name);

  // Nav aktif durumu güncelle
  _updateNavActive(name);

  emit('router:view', { view: name });
}

export function getCurrentView() {
  return _currentView;
}

function _updateNavActive(name) {
  const btns = document.querySelectorAll('[data-view]');
  btns.forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.view === name);
  });
}

function _initMobileNav() {
  if (!mobileNav) return;

  const NAV_ITEMS = [
    {
      view: 'randevu',
      label: 'Randevu',
      svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <rect x="2" y="2" width="12" height="12" rx="2"/>
        <path d="M5 1v2M11 1v2M2 6h12"/>
      </svg>`,
    },
    {
      view: 'haftalik',
      label: 'Haftalık',
      svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <rect x="2" y="2" width="12" height="12" rx="2"/>
        <path d="M2 6h12M6 2v12M10 2v12" opacity=".5"/>
      </svg>`,
    },
    {
      view: 'teyit',
      label: 'Teyit',
      svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <circle cx="8" cy="8" r="6"/>
        <path d="M5.5 8l2 2 3-3"/>
      </svg>`,
    },
  ];

  mobileNav.innerHTML = NAV_ITEMS.map(item => `
    <button class="mobile-nav__btn" data-view="${item.view}" type="button" aria-label="${item.label}">
      ${item.svg}
      ${item.label}
    </button>
  `).join('');
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initRouter() {
  // Mobile nav oluştur
  _initMobileNav();

  // Nav buton click'leri
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    showView(btn.dataset.view);
  });

  // Kullanıcı chip tıklama → kullanıcı seçim ekranı
  const headerUser = document.getElementById('header-user');
  if (headerUser) {
    headerUser.addEventListener('click', () => {
      emit('router:go-launcher', {});
    });
  }

  // Header logo tıklama → program seçim ekranı
  const btnHome = document.getElementById('btn-home');
  if (btnHome) {
    btnHome.addEventListener('click', () => {
      emit('router:go-appselect', {});
    });
  }
}

export function goToApp(view) {
  const target = view || getLastView() || 'haftalik';
  showScreen('app');
  showView(target);
}

export function goToLauncher() {
  showScreen('launcher');
}
