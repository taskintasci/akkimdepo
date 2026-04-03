/**
 * Launcher modülü
 *
 * Step 1: Kullanıcı listesi (user grid)
 * Step 2: Uygulama seçimi (3 app card) + admin için Personel yönetimi
 * Step 3: Personel yönetimi (admin only)
 */

import { loadPersons, savePersons }                            from '../../core/storage.js';
import { on }                                                   from '../../core/events.js';
import { setActiveUser, normalizeRole,
         verifyPin, setAdminSession, clearUser }                from '../../core/auth.js';
import { goToApp }                                              from '../../core/router.js';
import { getInitials, getAvatarColor }                         from '../../utils/format.js';
import { setActiveUserId }                                      from '../../utils/storage-local.js';
import { getIsAdminSession }                                    from '../../core/auth.js';

// ── Özel (sistem) kullanıcılar ───────────────────────────────────────────────
const SPECIAL_USERS = [
  { id: 'admin',   name: 'Admin',   role: 'admin', badge: 'ADMİN',   avatarColor: 'blue' },
  { id: 'misafir', name: 'Misafir', role: 'guest', badge: 'MİSAFİR', avatarColor: 'gray' },
];

let _persons = [];
let _selectedUser = null;
const ROOT = document.getElementById('launcher-root');

// ── Render ───────────────────────────────────────────────────────────────────

export async function initLauncher() {
  _persons = await loadPersons();

  on('persons:updated', ({ list }) => {
    _persons = list;
    if (_selectedUser) return;
    _renderStep1();
  });

  _renderStep1();
}

function _renderStep1() {
  clearUser();
  ROOT.innerHTML = `
    <div class="launcher animate-fade-in">
      <div class="launcher__brand">
        <div class="launcher__logo">Akkim İthalat ve İhracat <span>Planı</span></div>
      </div>

      <p class="launcher__heading">Kim olarak giriş yapıyorsunuz?</p>

      <div class="user-grid stagger" id="user-grid">
        ${SPECIAL_USERS.map(u => _specialUserCardHTML(u)).join('')}
        ${_persons.length
          ? _persons.map(p => _userCardHTML(p)).join('')
          : `<div style="grid-column:1/-1;text-align:center;color:var(--color-muted);font-size:var(--text-sm);">
               Personel listesi yükleniyor...
             </div>`
        }
      </div>
    </div>
  `;

  ROOT.querySelector('[data-id="admin"]')?.addEventListener('click', () => {
    _showPinDialog(SPECIAL_USERS[0]);
  });
  ROOT.querySelector('[data-id="misafir"]')?.addEventListener('click', () => {
    _selectUser({ ...SPECIAL_USERS[1] });
  });

  ROOT.querySelectorAll('.user-card:not([data-special])').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const user = _persons.find(p => p.id === id);
      if (!user) return;
      user.role = normalizeRole(user.role);
      _selectUser(user);
    });
  });
}

function _specialUserCardHTML(u) {
  return `
    <button class="user-card user-card--special" data-id="${u.id}" data-special="1" type="button" aria-label="${u.name} olarak giriş">
      <span class="user-card__name">${_esc(u.name)}</span>
      <span class="user-card__badge">${u.badge}</span>
    </button>
  `;
}

// ── PIN Dialog ────────────────────────────────────────────────────────────────

function _showPinDialog(adminUser) {
  ROOT.innerHTML = `
    <div class="launcher animate-fade-in">
      <div class="launcher__brand">
        <div class="launcher__logo">Akkim İthalat ve İhracat <span>Planı</span></div>
      </div>
      <div style="max-width:320px;margin:0 auto;text-align:center;">
        <div style="width:56px;height:56px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;margin:0 auto var(--space-4);">AD</div>
        <p style="font-size:var(--text-md);font-weight:var(--weight-semibold);margin-bottom:var(--space-5);">Admin PIN</p>
        <input class="field__input" type="password" id="pin-input"
               placeholder="••••" inputmode="numeric"
               style="text-align:center;font-size:1.5rem;letter-spacing:0.4em;margin-bottom:var(--space-2);"
               autocomplete="current-password"/>
        <div id="pin-error" style="color:var(--color-danger);font-size:var(--text-sm);min-height:1.4em;margin-bottom:var(--space-4);"></div>
        <div style="display:flex;gap:var(--space-2);justify-content:center;">
          <button class="btn btn--secondary" id="btn-pin-cancel" type="button">İptal</button>
          <button class="btn btn--primary" id="btn-pin-ok" type="button">Giriş</button>
        </div>
      </div>
    </div>
  `;

  ROOT.querySelector('#btn-pin-cancel')?.addEventListener('click', () => _renderStep1());

  const doVerify = async () => {
    const pin = ROOT.querySelector('#pin-input')?.value || '';
    const ok  = await verifyPin(pin);
    if (ok) {
      setAdminSession(true);
      _selectUser({ ...adminUser });
    } else {
      const errEl = ROOT.querySelector('#pin-error');
      if (errEl) errEl.textContent = 'Hatalı PIN, tekrar deneyin.';
      const inp = ROOT.querySelector('#pin-input');
      if (inp) { inp.value = ''; inp.focus(); }
    }
  };

  ROOT.querySelector('#btn-pin-ok')?.addEventListener('click', doVerify);
  ROOT.querySelector('#pin-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doVerify();
  });

  setTimeout(() => ROOT.querySelector('#pin-input')?.focus(), 80);
}

function _userCardHTML(person) {
  return `
    <button class="user-card" data-id="${person.id}" type="button" aria-label="${person.name} olarak giriş">
      <span class="user-card__name">${_esc(person.name)}</span>
      ${person.role ? `<span class="user-card__role">${_esc(person.role)}</span>` : ''}
    </button>
  `;
}

function _renderStep2(user) {
  const isAdmin = user.role === 'admin' || getIsAdminSession();
  ROOT.innerHTML = `
    <div class="launcher animate-fade-in">
      <div class="launcher__brand">
        <div class="launcher__logo">Akkim İthalat ve İhracat <span>Planı</span></div>
      </div>

      <div class="launcher__back">
        <span class="avatar" data-color="${getAvatarColor(user.name)}" aria-hidden="true">
          ${getInitials(user.name)}
        </span>
        <div>
          <div style="font-weight:var(--weight-semibold);font-size:var(--text-md);">${_esc(user.name)}</div>
          <div style="font-size:var(--text-xs);color:var(--color-muted);">Hangi uygulamayı açmak istiyorsunuz?</div>
        </div>
        <button class="btn btn--ghost btn--sm" id="btn-back-users" type="button" aria-label="Kullanıcı seçimine dön" style="margin-left:auto;">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M10 4l-4 4 4 4"/>
          </svg>
          Değiştir
        </button>
      </div>

      <div class="app-grid stagger">
        ${_appCardHTML('randevu', 'Randevu', 'Araç slot planlaması',
          `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 9h18M8 2v2M16 2v2"/></svg>`)}
        ${_appCardHTML('haftalik', 'Haftalık Plan', 'Personel iş planı',
          `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18M3 15h18" opacity=".5"/></svg>`)}
        ${_appCardHTML('teyit', 'Günlük Teyit', 'Araç teyit takibi',
          `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M20 6.5L9 17.5l-5-5"/><circle cx="12" cy="12" r="9" opacity=".25"/></svg>`)}
      </div>

      ${isAdmin ? `
        <button class="launcher__admin-link" id="btn-open-personel" type="button">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" style="display:inline;vertical-align:middle;margin-right:4px;"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
          Personel Yönetimi
        </button>
      ` : ''}
    </div>
  `;

  ROOT.querySelector('#btn-back-users')?.addEventListener('click', () => {
    _selectedUser = null;
    _renderStep1();
  });

  ROOT.querySelectorAll('.app-card').forEach(card => {
    card.addEventListener('click', () => {
      const view = card.dataset.view;
      setActiveUser(user);
      setActiveUserId(user.id);
      goToApp(view);
    });
  });

  ROOT.querySelector('#btn-open-personel')?.addEventListener('click', () => {
    _renderPersonelStep(user);
  });
}

function _appCardHTML(view, name, desc, iconSVG) {
  return `
    <button class="app-card" data-view="${view}" type="button" aria-label="${name} uygulamasını aç">
      <span class="app-card__icon" aria-hidden="true">${iconSVG}</span>
      <span class="app-card__name">${name}</span>
      <span class="app-card__desc">${desc}</span>
    </button>
  `;
}

// ── Personel Yönetimi (Admin) ─────────────────────────────────────────────────

function _renderPersonelStep(user) {
  ROOT.innerHTML = `
    <div class="launcher animate-fade-in" style="align-items:stretch;max-width:480px;width:100%;margin:0 auto;">
      <div class="launcher__brand">
        <div class="launcher__logo">Akkim İthalat ve İhracat <span>Planı</span></div>
      </div>

      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6);">
        <button class="btn btn--ghost btn--sm" id="btn-personel-back" type="button">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4l-4 4 4 4"/></svg>
          Geri
        </button>
        <span style="font-weight:var(--weight-semibold);font-size:var(--text-md);">Personel Yönetimi</span>
      </div>

      <div id="person-list" style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-6);"></div>

      <div class="divider" style="margin-bottom:var(--space-4);"></div>

      <div style="font-weight:var(--weight-semibold);font-size:var(--text-sm);margin-bottom:var(--space-3);">Yeni Personel Ekle</div>
      <div class="form-grid" style="margin-bottom:var(--space-4);">
        <div class="field">
          <label class="field__label required" for="new-person-name">Ad Soyad</label>
          <input class="field__input" type="text" id="new-person-name" placeholder="Ad Soyad" autocomplete="off"/>
        </div>
        <div class="field">
          <label class="field__label" for="new-person-role">Ünvan / Rol</label>
          <input class="field__input" type="text" id="new-person-role" placeholder="Örn: Operatör" autocomplete="off"/>
        </div>
        <div class="field field--full">
          <label class="field__label" for="new-person-mail">E-posta</label>
          <input class="field__input" type="email" id="new-person-mail" placeholder="mail@akkim.com.tr" autocomplete="off"/>
        </div>
      </div>
      <button class="btn btn--primary" id="btn-person-add" type="button" style="width:100%;">Ekle</button>
    </div>
  `;

  _renderPersonList();

  ROOT.querySelector('#btn-personel-back')?.addEventListener('click', () => {
    _renderStep2(user);
  });

  ROOT.querySelector('#btn-person-add')?.addEventListener('click', () => {
    const nameEl = ROOT.querySelector('#new-person-name');
    const name   = nameEl?.value.trim();
    if (!name) { nameEl?.classList.add('has-error'); nameEl?.focus(); return; }
    const role = ROOT.querySelector('#new-person-role')?.value.trim() || '';
    const mail = ROOT.querySelector('#new-person-mail')?.value.trim() || '';
    const id   = _personId(name);
    _persons.push({ id, name, role, mail });
    nameEl.value = '';
    ROOT.querySelector('#new-person-role').value = '';
    ROOT.querySelector('#new-person-mail').value = '';
    _renderPersonList();
    savePersons(JSON.parse(JSON.stringify(_persons)));
  });
}

function _renderPersonList() {
  const list = ROOT.querySelector('#person-list');
  if (!list) return;
  list.innerHTML = _persons.map(p => `
    <div class="person-item" id="pitem-${p.id}" style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);">
      <span class="avatar avatar--sm" data-color="${getAvatarColor(p.name)}">${getInitials(p.name)}</span>
      <div id="pinfo-${p.id}" style="flex:1;min-width:0;">
        <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${_esc(p.name)}</div>
        ${p.role ? `<div style="font-size:var(--text-xs);color:var(--color-muted);">${_esc(p.role)}</div>` : ''}
        ${p.mail ? `<div style="font-size:var(--text-xs);color:var(--color-muted);">✉ ${_esc(p.mail)}</div>` : ''}
      </div>
      <div id="pedit-${p.id}" hidden style="flex:1;display:flex;flex-direction:column;gap:var(--space-1);">
        <input class="field__input" type="text" value="${_esc(p.name)}" placeholder="Ad Soyad" id="pename-${p.id}"/>
        <input class="field__input" type="text" value="${_esc(p.role||'')}" placeholder="Ünvan / Rol" id="perole-${p.id}"/>
        <input class="field__input" type="email" value="${_esc(p.mail||'')}" placeholder="mail@akkim.com.tr" id="pemail-${p.id}"/>
      </div>
      <div id="pactions-${p.id}" style="display:flex;gap:var(--space-1);flex-shrink:0;">
        <button class="btn btn--secondary btn--sm" data-edit-pid="${p.id}" type="button">Düzenle</button>
        <button class="btn btn--danger btn--sm" data-del-pid="${p.id}" type="button">Sil</button>
      </div>
      <div id="psave-${p.id}" hidden style="display:flex;gap:var(--space-1);flex-shrink:0;">
        <button class="btn btn--primary btn--sm" data-save-pid="${p.id}" type="button">Kaydet</button>
        <button class="btn btn--ghost btn--sm" data-cancel-pid="${p.id}" type="button">İptal</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-edit-pid]').forEach(btn => {
    btn.addEventListener('click', () => _editPerson(btn.dataset.editPid));
  });
  list.querySelectorAll('[data-del-pid]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Bu personel silinsin mi?')) return;
      _persons = _persons.filter(p => p.id !== btn.dataset.delPid);
      _renderPersonList();
      savePersons(JSON.parse(JSON.stringify(_persons)));
    });
  });
  list.querySelectorAll('[data-save-pid]').forEach(btn => {
    btn.addEventListener('click', () => _savePerson(btn.dataset.savePid));
  });
  list.querySelectorAll('[data-cancel-pid]').forEach(btn => {
    btn.addEventListener('click', () => _cancelEditPerson(btn.dataset.cancelPid));
  });
}

function _editPerson(id) {
  ROOT.querySelector(`#pinfo-${id}`).hidden = true;
  ROOT.querySelector(`#pedit-${id}`).hidden = false;
  ROOT.querySelector(`#pactions-${id}`).hidden = true;
  ROOT.querySelector(`#psave-${id}`).hidden = false;
  ROOT.querySelector(`#pename-${id}`)?.focus();
}

function _cancelEditPerson(id) {
  ROOT.querySelector(`#pinfo-${id}`).hidden = false;
  ROOT.querySelector(`#pedit-${id}`).hidden = true;
  ROOT.querySelector(`#pactions-${id}`).hidden = false;
  ROOT.querySelector(`#psave-${id}`).hidden = true;
}

function _savePerson(id) {
  const name = ROOT.querySelector(`#pename-${id}`)?.value.trim();
  const role = ROOT.querySelector(`#perole-${id}`)?.value.trim();
  const mail = ROOT.querySelector(`#pemail-${id}`)?.value.trim();
  if (!name) { ROOT.querySelector(`#pename-${id}`)?.classList.add('has-error'); return; }
  const p = _persons.find(x => x.id === id);
  if (!p) return;
  p.name = name; p.role = role || ''; p.mail = mail || '';
  _renderPersonList();
  savePersons(JSON.parse(JSON.stringify(_persons)));
}

// ── Actions ──────────────────────────────────────────────────────────────────

function _selectUser(user) {
  _selectedUser = user;
  _renderStep2(user);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _personId(name) {
  return name.toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]/g,'') + '_' + Date.now().toString(36);
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
