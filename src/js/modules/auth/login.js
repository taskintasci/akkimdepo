/**
 * Login Modülü — Firebase Auth e-posta/şifre girişi
 */

import { auth } from '../../core/firebase.js';

const ROOT = document.getElementById('login-root');

export function initLogin() {
  _render();
}

// ── Render ────────────────────────────────────────────────────────────────────

function _render() {
  if (!ROOT) return;

  ROOT.innerHTML = `
    <div class="login-card animate-fade-in">

      <!-- Sol panel: Marka -->
      <div class="login-brand">
        <div class="login-brand__blur1"></div>
        <div class="login-brand__blur2"></div>

        <div class="login-brand__logo">
          <div class="login-brand__logo-icon">
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <rect x="2"  y="2"  width="11" height="11" rx="2.5" fill="white"/>
              <rect x="15" y="2"  width="11" height="11" rx="2.5" fill="white" opacity=".6"/>
              <rect x="2"  y="15" width="11" height="11" rx="2.5" fill="white" opacity=".6"/>
              <rect x="15" y="15" width="11" height="11" rx="2.5" fill="white" opacity=".3"/>
            </svg>
          </div>
          <span class="login-brand__logo-text">Akkim İthalat ve İhracat Planı</span>
        </div>

        <h1 class="login-brand__headline">Lojistik Operasyonlarını<br>Tek Ekrandan Yönetin.</h1>
        <p class="login-brand__desc">Randevu planlama, haftalık operasyonlar ve araç teyit süreçlerinizi gerçek zamanlı takip edin.</p>

        <div class="login-brand__features">
          <div class="login-brand__feature">
            <div class="login-brand__feature-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v2M16 2v2"/>
              </svg>
            </div>
            <div>
              <div class="login-brand__feature-title">Randevu Yönetimi</div>
              <div class="login-brand__feature-desc">ADR ve Normal slot planlaması, sürükle-bırak.</div>
            </div>
          </div>
          <div class="login-brand__feature">
            <div class="login-brand__feature-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div class="login-brand__feature-title">Rol Tabanlı Erişim</div>
              <div class="login-brand__feature-desc">Firebase Authentication ile güvence altında.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sağ panel: Form -->
      <div class="login-form-panel">

        <!-- Mobilde marka -->
        <div class="login-mobile-brand">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect width="28" height="28" rx="8" fill="var(--color-accent)"/>
            <rect x="7"  y="7"  width="6" height="6" rx="1.5" fill="white"/>
            <rect x="15" y="7"  width="6" height="6" rx="1.5" fill="white" opacity=".6"/>
            <rect x="7"  y="15" width="6" height="6" rx="1.5" fill="white" opacity=".6"/>
            <rect x="15" y="15" width="6" height="6" rx="1.5" fill="white" opacity=".3"/>
          </svg>
          <span class="login-mobile-brand__text">Akkim</span>
        </div>

        <!-- Tema toggle -->
        <button class="btn btn--icon btn--ghost login-theme-btn" id="login-btn-theme" type="button" aria-label="Temayı değiştir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="login-theme-icon">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>

        <div class="login-form__header">
          <h2 class="login-form__title">Hoş Geldiniz</h2>
          <p class="login-form__subtitle">Sisteme erişmek için kimlik bilgilerinizi girin.</p>
        </div>

        <!-- E-posta -->
        <div class="login-field">
          <label class="login-field__label" for="login-email">E-POSTA ADRESİ</label>
          <div class="login-field__wrap">
            <span class="login-field__icon" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </span>
            <input class="login-field__input" type="email" id="login-email"
                   placeholder="ornek@akkim.com.tr" autocomplete="email"
                   inputmode="email" />
          </div>
        </div>

        <!-- Şifre -->
        <div class="login-field">
          <label class="login-field__label" for="login-password">ŞİFRE</label>
          <div class="login-field__wrap">
            <span class="login-field__icon" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </span>
            <input class="login-field__input login-field__input--password" type="password"
                   id="login-password" placeholder="••••••••" autocomplete="current-password" />
            <button class="login-field__toggle" id="btn-pw-toggle" type="button" aria-label="Şifreyi göster/gizle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" id="pw-eye">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Hata mesajı -->
        <div class="login-error" id="login-error" hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span id="login-error-text"></span>
        </div>

        <!-- Submit -->
        <button class="login-submit" id="btn-login-submit" type="button">
          <span id="login-btn-label">Sisteme Giriş Yap</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="login-btn-icon" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>

        <!-- Güvenlik notu -->
        <div class="login-security">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-subtle)" stroke-width="1.75" style="flex-shrink:0;margin-top:2px" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <p class="login-security__text">
            <strong>Güvenlik Protokolü:</strong> Bu sisteme erişim yalnızca yetkili personelle sınırlıdır.
            Tüm işlemler kayıt altına alınmaktadır.
          </p>
        </div>

      </div>
    </div>

    <!-- Sistem durumu -->
    <div class="login-status" aria-hidden="true">
      <span class="login-status__label">SİSTEM DURUMU</span>
      <span class="login-status__online">
        <span class="login-status__dot"></span>
        Çevrimiçi
      </span>
    </div>
  `;

  _bindEvents();
  _syncThemeIcon();
}

// ── Events ────────────────────────────────────────────────────────────────────

function _bindEvents() {
  const emailEl    = ROOT.querySelector('#login-email');
  const passwordEl = ROOT.querySelector('#login-password');
  const submitBtn  = ROOT.querySelector('#btn-login-submit');
  const toggleBtn  = ROOT.querySelector('#btn-pw-toggle');
  const themeBtn   = ROOT.querySelector('#login-btn-theme');

  submitBtn.addEventListener('click', _doLogin);

  [emailEl, passwordEl].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') _doLogin();
      _clearError();
    });
    el.addEventListener('input', _clearError);
  });

  toggleBtn.addEventListener('click', () => {
    const show = passwordEl.type === 'password';
    passwordEl.type = show ? 'text' : 'password';
    const eye = ROOT.querySelector('#pw-eye');
    eye.innerHTML = show
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  });

  themeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('akkim-theme', isDark ? 'dark' : 'light');
    _syncThemeIcon();
  });

  setTimeout(() => emailEl.focus(), 80);
}

// ── Login logic ───────────────────────────────────────────────────────────────

async function _doLogin() {
  const emailEl    = ROOT.querySelector('#login-email');
  const passwordEl = ROOT.querySelector('#login-password');

  const email    = emailEl.value.trim();
  const password = passwordEl.value;

  if (!email || !password) {
    _showError('E-posta ve şifre alanları zorunludur.');
    return;
  }

  _setLoading(true);

  try {
    await auth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged in app.js handles the rest
  } catch (err) {
    _setLoading(false);
    _showError(_errMsg(err.code));
    passwordEl.value = '';
    passwordEl.focus();
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function _setLoading(loading) {
  const btn   = ROOT.querySelector('#btn-login-submit');
  const label = ROOT.querySelector('#login-btn-label');
  const icon  = ROOT.querySelector('#login-btn-icon');
  btn.disabled = loading;
  if (loading) {
    label.textContent = 'Giriş yapılıyor…';
    if (icon) icon.outerHTML = `<span class="login-submit__spinner" id="login-btn-icon"></span>`;
  } else {
    label.textContent = 'Sisteme Giriş Yap';
    const spinner = ROOT.querySelector('#login-btn-icon');
    if (spinner) spinner.outerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="login-btn-icon" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
  }
}

function _showError(msg) {
  const el  = ROOT.querySelector('#login-error');
  const txt = ROOT.querySelector('#login-error-text');
  if (!el || !txt) return;
  txt.textContent = msg;
  el.hidden = false;
}

function _clearError() {
  const el = ROOT.querySelector('#login-error');
  if (el) el.hidden = true;
}

function _syncThemeIcon() {
  const btn  = ROOT?.querySelector('#login-btn-theme');
  const icon = ROOT?.querySelector('#login-theme-icon');
  if (!btn || !icon) return;
  const isDark = document.documentElement.classList.contains('dark');
  icon.innerHTML = isDark
    ? `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`
    : `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  btn.title = isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç';
}

function _errMsg(code) {
  const map = {
    'auth/user-not-found':         'Bu e-posta adresi sistemde kayıtlı değil.',
    'auth/wrong-password':         'Şifre hatalı. Lütfen tekrar deneyin.',
    'auth/invalid-email':          'Geçersiz e-posta adresi.',
    'auth/user-disabled':          'Bu hesap devre dışı bırakılmış.',
    'auth/too-many-requests':      'Çok fazla başarısız deneme. Lütfen biraz bekleyin.',
    'auth/invalid-credential':     'E-posta veya şifre hatalı.',
    'auth/network-request-failed': 'Bağlantı hatası. İnternet bağlantınızı kontrol edin.',
  };
  return map[code] || 'Giriş yapılırken bir hata oluştu. Tekrar deneyin.';
}
