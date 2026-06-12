/**
 * Launcher modülü
 *
 * Firebase Auth ile giriş yapıldıktan sonra gösterilen uygulama seçim ekranı.
 * Step 1 (kullanıcı grid'i) kaldırıldı — kimlik doğrulama login.js üzerinden.
 * Step 2: Uygulama seçimi (3 kart) + admin için Personel yönetimi
 */

import { loadPersons }                                      from '../../core/storage.js';
import { on, emit }                                         from '../../core/events.js';
import { getActiveUser, normalizeRole, clearUser,
         refreshToken }                                     from '../../core/auth.js';
import { functions }                                        from '../../core/firebase.js';
import { goToApp }                                          from '../../core/router.js';
import { getInitials, getAvatarColor }                      from '../../utils/format.js';
import { getIsAdminSession }                                from '../../core/auth.js';
import { loadWeekStats, loadActivityLog,
         fmtDuration, timeAgo }                             from '../../utils/analytics.js';
import { getWeekId, formatWeekTitle,
         prevWeek, nextWeek }                               from '../../utils/date.js';
import { emit as emitEvent }                                from '../../core/events.js';

// Cloud Functions
const fnCreateUser  = functions.httpsCallable('createAuthUser');
const fnDeleteUser  = functions.httpsCallable('deleteAuthUser');
const fnUpdateUser  = functions.httpsCallable('updateAuthUser');
const fnResetPw     = functions.httpsCallable('sendPasswordReset');

let _persons = [];
const ROOT = document.getElementById('launcher-root');

// ── Init ─────────────────────────────────────────────────────────────────────

export async function initLauncher() {
  _persons = await loadPersons();

  on('persons:updated', ({ list }) => {
    _persons = list;
  });
}

// ── Step 2: Uygulama seçimi ───────────────────────────────────────────────────

export function goToAppSelect() {
  const user = getActiveUser();
  if (!user) return;
  _renderStep2(user);
}

function _renderStep2(user) {
  const isAdmin = getIsAdminSession();

  ROOT.innerHTML = `
    <div class="launcher animate-fade-in">
      <div class="launcher__brand">
        <div class="launcher__logo">
          <span class="launcher__logo-akkim">Akkim</span>
          <span class="launcher__logo-sub">İthalat ve İhracat Planı</span>
        </div>
      </div>

      <span class="launcher__version">v5.0.0</span>

      <!-- Kullanıcı bilgisi + çıkış -->
      <div class="launcher__user-row">
        <div class="launcher__user-info">
          <span class="avatar" data-color="${getAvatarColor(user.name)}" aria-hidden="true">
            ${getInitials(user.name)}
          </span>
          <div>
            <div style="font-weight:var(--weight-semibold);font-size:var(--text-base);">${_esc(user.name)}</div>
            <div style="font-size:var(--text-xs);color:var(--color-muted);">${_esc(user.email || '')}</div>
          </div>
        </div>
        <button class="btn btn--ghost btn--sm" id="btn-logout" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Çıkış Yap
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

      <div class="launcher__actions">
        <button class="btn btn--secondary btn--sm" id="btn-launcher-monthly" type="button">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 7h12M6 2v2M10 2v2"/></svg>
          Aylık Özet
        </button>
      </div>

      ${isAdmin ? `
        <div style="display:flex;gap:var(--space-3);justify-content:center;flex-wrap:wrap;">
          <button class="launcher__admin-link" id="btn-open-personel" type="button">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" style="display:inline;vertical-align:middle;margin-right:4px;" aria-hidden="true"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
            Personel Yönetimi
          </button>
          <button class="launcher__admin-link" id="btn-open-stats" type="button">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" style="display:inline;vertical-align:middle;margin-right:4px;" aria-hidden="true"><rect x="2" y="9" width="3" height="5" rx="1"/><rect x="6" y="6" width="3" height="8" rx="1"/><rect x="10" y="3" width="3" height="11" rx="1"/></svg>
            İstatistikler
          </button>
        </div>
      ` : ''}
    </div>
  `;

  // App kartları
  ROOT.querySelectorAll('.app-card').forEach(card => {
    card.addEventListener('click', () => goToApp(card.dataset.view));
  });

  // Çıkış
  ROOT.querySelector('#btn-logout')?.addEventListener('click', () => {
    _showConfirmDialog('Çıkış yapmak istediğinize emin misiniz?', () => clearUser());
  });

  // Aylık özet
  ROOT.querySelector('#btn-launcher-monthly')?.addEventListener('click', () => {
    emit('haftalik:open-monthly', {});
  });

  // Admin: personel yönetimi
  ROOT.querySelector('#btn-open-personel')?.addEventListener('click', () => {
    _renderPersonelStep(user);
  });

  // Admin: istatistikler
  ROOT.querySelector('#btn-open-stats')?.addEventListener('click', () => {
    _openStats();
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
    <div class="launcher animate-fade-in" style="align-items:stretch;max-width:520px;width:100%;margin:0 auto;">
      <div class="launcher__brand">
        <div class="launcher__logo"><span class="launcher__logo-akkim">Akkim</span><span class="launcher__logo-sub">İthalat ve İhracat Planı</span></div>
      </div>

      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6);">
        <button class="btn btn--ghost btn--sm" id="btn-personel-back" type="button">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 4l-4 4 4 4"/></svg>
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
          <label class="field__label required" for="new-person-email">E-posta</label>
          <input class="field__input" type="email" id="new-person-email" placeholder="isim@akkim.com.tr" autocomplete="off"/>
        </div>
        <div class="field">
          <label class="field__label required" for="new-person-password">Geçici Şifre</label>
          <input class="field__input" type="password" id="new-person-password" placeholder="En az 6 karakter" autocomplete="new-password"/>
        </div>
        <div class="field">
          <label class="field__label" for="new-person-role">Rol</label>
          <select class="field__input" id="new-person-role">
            <option value="mht_operator">MHT Operatör</option>
            <option value="wms">WMS Operatör</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <button class="btn btn--primary" id="btn-person-add" type="button" style="width:100%;">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
        Personel Ekle
      </button>
      <div id="person-add-error" style="margin-top:var(--space-2);color:var(--color-danger);font-size:var(--text-sm);min-height:1.2em;"></div>
    </div>
  `;

  _renderPersonList();

  ROOT.querySelector('#btn-personel-back')?.addEventListener('click', () => {
    _renderStep2(user);
  });

  ROOT.querySelector('#btn-person-add')?.addEventListener('click', () => _addPerson());
}

function _renderPersonList() {
  const list = ROOT.querySelector('#person-list');
  if (!list) return;

  if (!_persons.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--color-muted);font-size:var(--text-sm);padding:var(--space-4);">Henüz personel yok.</div>`;
    return;
  }

  list.innerHTML = _persons.map((p, idx) => `
    <div class="person-item" id="pitem-${p.id}" style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);">
      <span class="avatar avatar--sm" data-color="${getAvatarColor(p.name)}" aria-hidden="true">${getInitials(p.name)}</span>
      <div id="pinfo-${p.id}" style="flex:1;min-width:0;">
        <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${_esc(p.name)}</div>
        ${p.role  ? `<div style="font-size:var(--text-xs);color:var(--color-muted);">${_esc(_roleLabel(p.role))}</div>` : ''}
        ${p.email ? `<div style="font-size:var(--text-xs);color:var(--color-muted);">✉ ${_esc(p.email)}</div>` : ''}
      </div>
      <div id="pedit-${p.id}" hidden style="flex:1;display:flex;flex-direction:column;gap:var(--space-1);">
        <input class="field__input" type="text"  value="${_esc(p.name)}"        placeholder="Ad Soyad"           id="pename-${p.id}"/>
        <input class="field__input" type="email" value="${_esc(p.email||'')}"   placeholder="E-posta"             id="pemail-${p.id}"/>
        <select class="field__input" id="perole-${p.id}">
          <option value="mht_operator" ${(p.role==='mht_operator'||p.role==='normal')?'selected':''}>MHT Operatör</option>
          <option value="wms"         ${p.role==='wms'?'selected':''}>WMS Operatör</option>
          <option value="admin"       ${p.role==='admin'?'selected':''}>Admin</option>
        </select>
      </div>
      <div id="pactions-${p.id}" style="display:flex;gap:var(--space-1);flex-shrink:0;">
        <button class="btn btn--ghost btn--icon btn--sm" data-up-pid="${p.id}"   type="button" title="Yukarı taşı"  ${idx===0?'disabled':''}>▲</button>
        <button class="btn btn--ghost btn--icon btn--sm" data-down-pid="${p.id}" type="button" title="Aşağı taşı"   ${idx===_persons.length-1?'disabled':''}>▼</button>
        <button class="btn btn--secondary btn--sm"       data-edit-pid="${p.id}" type="button">Düzenle</button>
        <button class="btn btn--ghost btn--icon btn--sm" data-pw-pid="${p.id}"   type="button" title="Şifre sıfırla">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M13 6.5a5 5 0 1 0-1 3.2"/><path d="M13 2v4.5H8.5"/></svg>
        </button>
        <button class="btn btn--danger btn--sm"          data-del-pid="${p.id}"  type="button">Sil</button>
      </div>
      <div id="psave-${p.id}" hidden style="display:flex;gap:var(--space-1);flex-shrink:0;">
        <button class="btn btn--primary btn--sm" data-save-pid="${p.id}"   type="button">Kaydet</button>
        <button class="btn btn--ghost btn--sm"   data-cancel-pid="${p.id}" type="button">İptal</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-edit-pid]').forEach(btn =>
    btn.addEventListener('click', () => _editPerson(btn.dataset.editPid)));

  list.querySelectorAll('[data-del-pid]').forEach(btn =>
    btn.addEventListener('click', () => {
      const pid    = btn.dataset.delPid;
      const person = _persons.find(p => p.id === pid);
      if (!person) return;
      _showConfirmDialog(`"${_esc(person.name)}" silinsin mi?`, () => _deletePerson(pid));
    }));

  list.querySelectorAll('[data-save-pid]').forEach(btn =>
    btn.addEventListener('click', () => _savePerson(btn.dataset.savePid)));

  list.querySelectorAll('[data-cancel-pid]').forEach(btn =>
    btn.addEventListener('click', () => _cancelEditPerson(btn.dataset.cancelPid)));

  list.querySelectorAll('[data-up-pid]').forEach(btn =>
    btn.addEventListener('click', () => _movePerson(btn.dataset.upPid, -1)));

  list.querySelectorAll('[data-down-pid]').forEach(btn =>
    btn.addEventListener('click', () => _movePerson(btn.dataset.downPid, 1)));

  list.querySelectorAll('[data-pw-pid]').forEach(btn =>
    btn.addEventListener('click', () => {
      const person = _persons.find(p => p.id === btn.dataset.pwPid);
      if (!person?.email) return;
      _showConfirmDialog(`"${_esc(person.name)}" için şifre sıfırlama e-postası gönderilsin mi?`,
        () => _sendPasswordReset(person.email));
    }));
}

// ── Personel CRUD (Cloud Functions) ──────────────────────────────────────────

async function _addPerson() {
  const nameEl  = ROOT.querySelector('#new-person-name');
  const emailEl = ROOT.querySelector('#new-person-email');
  const pwEl    = ROOT.querySelector('#new-person-password');
  const roleEl  = ROOT.querySelector('#new-person-role');
  const errEl   = ROOT.querySelector('#person-add-error');

  const name     = nameEl.value.trim();
  const email    = emailEl.value.trim();
  const password = pwEl.value;
  const role     = roleEl.value || 'mht_operator';

  if (!name || !email || !password) {
    errEl.textContent = 'Ad, e-posta ve şifre zorunludur.';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = 'Şifre en az 6 karakter olmalıdır.';
    return;
  }

  errEl.textContent = '';
  const btn = ROOT.querySelector('#btn-person-add');
  btn.disabled = true;
  btn.textContent = 'Ekleniyor…';

  try {
    await fnCreateUser({ name, email, password, role });
    nameEl.value  = '';
    emailEl.value = '';
    pwEl.value    = '';
    roleEl.value  = 'mht_operator';
    _persons = await import('../../core/storage.js').then(m => m.loadPersons());
    _renderPersonList();
    window.App?.showToast({ title: `${name} eklendi`, type: 'success' });
  } catch (err) {
    errEl.textContent = _fnErrMsg(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg> Personel Ekle`;
  }
}

async function _deletePerson(uid) {
  try {
    await fnDeleteUser({ uid });
    _persons = _persons.filter(p => p.id !== uid && p.uid !== uid);
    _renderPersonList();
    window.App?.showToast({ title: 'Personel silindi', type: 'success' });
  } catch (err) {
    window.App?.showToast({ title: 'Silinemedi', desc: _fnErrMsg(err), type: 'error' });
  }
}

async function _savePerson(id) {
  const name  = ROOT.querySelector(`#pename-${id}`)?.value.trim();
  const email = ROOT.querySelector(`#pemail-${id}`)?.value.trim();
  const role  = ROOT.querySelector(`#perole-${id}`)?.value || 'normal';

  if (!name) { ROOT.querySelector(`#pename-${id}`)?.classList.add('has-error'); return; }

  const saveBtn = ROOT.querySelector(`[data-save-pid="${id}"]`);
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }

  const person = _persons.find(x => x.id === id || x.uid === id);
  const hasAuthAccount = !!(person?.uid);

  try {
    if (hasAuthAccount) {
      // Firebase Auth kullanıcısı — Cloud Function ile güncelle
      await fnUpdateUser({ uid: person.uid, name, email, role });
    } else {
      // Eski kullanıcı — sadece Firestore'u güncelle
      if (person) { person.name = name; person.email = email || ''; person.role = role; }
      await import('../../core/storage.js').then(m =>
        m.savePersons(JSON.parse(JSON.stringify(_persons))));
    }
    if (person) { person.name = name; person.email = email || ''; person.role = role; }
    _renderPersonList();
    window.App?.showToast({ title: 'Kaydedildi', type: 'success' });
  } catch (err) {
    window.App?.showToast({ title: 'Kaydedilemedi', desc: _fnErrMsg(err), type: 'error' });
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Kaydet'; }
  }
}

async function _sendPasswordReset(email) {
  try {
    await fnResetPw({ email });
    window.App?.showToast({ title: 'Şifre sıfırlama e-postası gönderildi', type: 'success' });
  } catch (err) {
    window.App?.showToast({ title: 'Gönderilemedi', desc: _fnErrMsg(err), type: 'error' });
  }
}

function _editPerson(id) {
  ROOT.querySelector(`#pinfo-${id}`)?.toggleAttribute('hidden', true);
  ROOT.querySelector(`#pedit-${id}`)?.toggleAttribute('hidden', false);
  ROOT.querySelector(`#pactions-${id}`)?.toggleAttribute('hidden', true);
  ROOT.querySelector(`#psave-${id}`)?.toggleAttribute('hidden', false);
  ROOT.querySelector(`#pename-${id}`)?.focus();
}

function _cancelEditPerson(id) {
  ROOT.querySelector(`#pinfo-${id}`)?.toggleAttribute('hidden', false);
  ROOT.querySelector(`#pedit-${id}`)?.toggleAttribute('hidden', true);
  ROOT.querySelector(`#pactions-${id}`)?.toggleAttribute('hidden', false);
  ROOT.querySelector(`#psave-${id}`)?.toggleAttribute('hidden', true);
}

function _movePerson(id, dir) {
  const idx = _persons.findIndex(p => p.id === id || p.uid === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= _persons.length) return;
  [_persons[idx], _persons[newIdx]] = [_persons[newIdx], _persons[idx]];
  _renderPersonList();
  import('../../core/storage.js').then(m =>
    m.savePersons(JSON.parse(JSON.stringify(_persons))));
}

// ── İstatistikler Modalı ──────────────────────────────────────────────────────

const ACTION_LABELS = {
  entry_add:      '+ Kayıt ekledi',
  entry_edit:     '✎ Kayıt düzenledi',
  entry_delete:   '✕ Kayıt sildi',
  entry_complete: '✓ Tamamladı',
  entry_activate: '↺ Aktif etti',
};
const ACTION_COLORS = {
  entry_add:      'var(--color-normal)',
  entry_edit:     'var(--color-accent)',
  entry_delete:   'var(--color-danger, #e53e3e)',
  entry_complete: 'var(--color-normal)',
  entry_activate: 'var(--color-muted)',
};

function _activityItemHTML(item) {
  const initials   = getInitials(item.userName || '?');
  const color      = getAvatarColor(item.userName || '');
  const label      = ACTION_LABELS[item.action] || item.action;
  const labelColor = ACTION_COLORS[item.action] || 'var(--color-muted)';
  const when       = timeAgo(item.ts);

  return `
    <div class="activity-item">
      <span class="avatar avatar--sm" data-color="${color}" aria-hidden="true">${initials}</span>
      <div class="activity-item__body">
        <span class="activity-item__user">${_esc(item.userName || '')}</span>
        <span class="activity-item__action" style="color:${labelColor}">${_esc(label)}</span>
        ${item.details ? `<span class="activity-item__details">${_esc(item.details)}</span>` : ''}
      </div>
      <span class="activity-item__time">${_esc(when)}</span>
    </div>
  `;
}

async function _openStats() {
  const existing = document.getElementById('modal-stats');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id        = 'modal-stats';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="modal modal--wide">
      <div class="modal__header">
        <button class="btn btn--ghost btn--icon" id="btn-stats-prev" type="button" aria-label="Önceki hafta">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4l-4 4 4 4"/></svg>
        </button>
        <h2 class="modal__title" id="stats-modal-title">Site İstatistikleri</h2>
        <button class="btn btn--ghost btn--icon" id="btn-stats-next" type="button" aria-label="Sonraki hafta">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
        </button>
        <button class="modal__close" id="btn-stats-close" type="button" aria-label="Kapat">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
        </button>
      </div>
      <div class="modal__body">
        <div id="stats-body" style="min-height:200px;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('is-open'));

  const _close = () => {
    modal.classList.remove('is-open');
    modal.addEventListener('transitionend', () => modal.remove(), { once: true });
    setTimeout(() => { if (modal.isConnected) modal.remove(); }, 400);
  };
  modal.querySelector('#btn-stats-close').addEventListener('click', _close);
  modal.addEventListener('click', e => { if (e.target === modal) _close(); });

  let _statsWeek = getWeekId(new Date());

  async function _renderStats() {
    const body = modal.querySelector('#stats-body');
    body.innerHTML = `<div style="text-align:center;padding:var(--space-8);color:var(--color-muted);font-size:var(--text-sm);">Yükleniyor…</div>`;
    modal.querySelector('#stats-modal-title').textContent = formatWeekTitle(_statsWeek);

    const [stats, log] = await Promise.all([
      loadWeekStats(_statsWeek),
      loadActivityLog(60),
    ]);

    const activityHTML = log.length === 0
      ? `<div style="text-align:center;padding:var(--space-6);color:var(--color-muted);font-size:var(--text-sm);">Henüz aktivite yok</div>`
      : log.map(_activityItemHTML).join('');

    body.innerHTML = `
      <div class="stats-cards">
        <div class="stat-card stat-card--accent">
          <div class="stat-card__value">${stats.visits}</div>
          <div class="stat-card__label">Haftalık Ziyaret</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${fmtDuration(stats.totalDuration)}</div>
          <div class="stat-card__label">Toplam Süre</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${stats.uniqueUsers}</div>
          <div class="stat-card__label">Tekil Kullanıcı</div>
        </div>
      </div>

      <div style="margin:var(--space-6) 0 var(--space-3);font-size:var(--text-sm);font-weight:var(--weight-semibold);">
        Son Aktiviteler
      </div>
      <div class="activity-list">${activityHTML}</div>
    `;
  }

  modal.querySelector('#btn-stats-prev').addEventListener('click', () => {
    _statsWeek = prevWeek(_statsWeek);
    _renderStats();
  });
  modal.querySelector('#btn-stats-next').addEventListener('click', () => {
    _statsWeek = nextWeek(_statsWeek);
    _renderStats();
  });

  _renderStats();
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────

function _showConfirmDialog(message, onConfirm) {
  const existing = document.getElementById('launcher-confirm');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'launcher-confirm';
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'alertdialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.innerHTML = `
    <div class="modal modal--narrow">
      <div class="modal__header">
        <h2 class="modal__title">${message}</h2>
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary" id="lc-cancel" type="button">İptal</button>
        <button class="btn btn--danger"    id="lc-ok"     type="button">Onayla</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('is-open'));

  const _close = () => {
    backdrop.classList.remove('is-open');
    backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
    setTimeout(() => { if (backdrop.isConnected) backdrop.remove(); }, 300);
  };

  backdrop.querySelector('#lc-cancel').addEventListener('click', _close);
  backdrop.querySelector('#lc-ok').addEventListener('click', () => { _close(); onConfirm(); });
  backdrop.addEventListener('click', e => { if (e.target === backdrop) _close(); });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _roleLabel(role) {
  const MAP = { admin: 'Admin', wms: 'WMS Operatör', mht_operator: 'MHT Operatör', normal: 'MHT Operatör', guest: 'Misafir' };
  return MAP[role] || role;
}

function _fnErrMsg(err) {
  const code = err?.code || '';
  if (code === 'functions/already-exists')  return 'Bu e-posta adresi zaten kullanımda.';
  if (code === 'functions/permission-denied') return 'Bu işlem için admin yetkisi gereklidir.';
  if (code === 'functions/unauthenticated')  return 'Lütfen tekrar giriş yapın.';
  return err?.message || 'Bir hata oluştu.';
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
