/**
 * Günlük Teyit Modülü — window.T
 *
 * 3 aşamalı workflow: Bekliyor → Teyit Edildi → WMS İşlendi
 * Haftalık plandan veri çekme, WMS randevu seçimi.
 */

import { watchTeyit, saveTeyitDay, loadTeyitData } from '../../core/storage.js';
import { on }                                       from '../../core/events.js';
import { getActiveUser }                            from '../../core/auth.js';
import { parsePasteText }                           from '../../utils/parser.js';
import { formatDateLong, formatDateKey, parseDate,
         todayKey, addDays, prevMonth, nextMonth,
         getMonthDays, getMonthName, getWeekId }    from '../../utils/date.js';
import { setLastTeyitDate, getLastTeyitDate }       from '../../utils/storage-local.js';

// ── State ────────────────────────────────────────────────────────────────────

let _date      = todayKey();
let _calYear   = 0;
let _calMonth  = 0;
let _data      = {};   // dateStr → { items: [...] }
let _editIdx   = null;
let _selectedType = '';
let _unsubWatch = null;

// WMS slot seçimi
let _wmsItemIdx = null;
let _wmsSlots   = null;
// Haftalık çek seçim listesi
let _cekMatched = null;

const ROOT = document.getElementById('view-teyit');

// ── Init ─────────────────────────────────────────────────────────────────────

export async function init() {
  const today = new Date();
  _calYear  = today.getFullYear();
  _calMonth = today.getMonth() + 1;  // 1-based

  const saved = getLastTeyitDate();
  _date = saved || todayKey();

  // Firestore'dan tüm teyit verisini yükle (tek seferlik)
  try {
    const remote = await loadTeyitData(_date);
    if (remote?.items) _data[_date] = remote.items;
  } catch {}

  on('auth:changed', _render);
  on('user:changed', _render);
  _watchDate(_date);
  _render();
}

// ── Watch ─────────────────────────────────────────────────────────────────────

function _watchDate(dateStr) {
  if (_unsubWatch) { _unsubWatch(); _unsubWatch = null; }
  _unsubWatch = watchTeyit(dateStr, (fresh) => {
    if (fresh?.items) _data[dateStr] = fresh.items;
    else              _data[dateStr] = [];
    const modal = ROOT?.querySelector('#modal-teyit');
    if (!modal?.classList.contains('is-open')) _renderList();
  });
}

// ── Top-level Render ──────────────────────────────────────────────────────────

function _render() {
  if (!ROOT) return;
  ROOT.innerHTML = `
    <div class="teyit-page animate-fade-in">
      ${_toolbarHTML()}
      ${_statsHTML()}

      <div class="teyit-list" id="teyit-list">
        ${_listHTML()}
      </div>
    </div>

    ${_modalHTML()}
    ${_wmsModalHTML()}
    ${_confirmHTML()}
  `;

  _bindToolbarEvents();
  _bindListEvents();
  _bindModalEvents();
  _bindWmsEvents();
  _bindConfirmEvents();
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function _toolbarHTML() {
  const d = parseDate(_date);
  const DAY_NAMES = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const isToday = _date === todayKey();
  const label = `${d.getDate()} ${getMonthName(d.getMonth()+1)} ${d.getFullYear()} ${DAY_NAMES[d.getDay()]}${isToday ? ' · Bugün' : ''}`;
  const wNum = parseInt(getWeekId(d).split('-W')[1], 10);

  return `
    <div class="teyit-toolbar">
      <button class="btn btn--ghost btn--icon" id="btn-teyit-prev" type="button" aria-label="Önceki gün">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4l-4 4 4 4"/></svg>
      </button>

      <span class="toolbar-week-badge">${wNum}</span>

      <div class="teyit-cal-wrap">
        <button class="teyit-date-label" id="btn-teyit-cal" type="button">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 7h12M5 1v2M11 1v2"/></svg>
          ${label}
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
        </button>
        <div class="teyit-cal-popup" id="teyit-cal-popup">
          ${_calPopupHTML()}
        </div>
      </div>

      <button class="btn btn--ghost btn--icon" id="btn-teyit-next" type="button" aria-label="Sonraki gün">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
      </button>

      <button class="btn btn--ghost btn--sm" id="btn-teyit-today" type="button">Bugün</button>

      <div class="teyit-toolbar__spacer"></div>

      ${_canEdit() ? `
        <button class="btn btn--primary btn--sm" id="btn-teyit-add" type="button">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 3v10M3 8h10"/></svg>
          Araç Ekle
        </button>
      ` : ''}
    </div>
  `;
}

function _calPopupHTML() {
  const days = getMonthDays(_calYear, _calMonth);
  const todayStr = todayKey();
  const firstDate = parseDate(days[0]);
  let startDow = firstDate.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  // Tüm slot'ları düz dizi: boşluklar null, günler dateStr
  const allSlots = [...Array(startDow).fill(null), ...days];
  while (allSlots.length % 7 !== 0) allSlots.push(null);

  // 7'li satırlar
  const rows = [];
  for (let i = 0; i < allSlots.length; i += 7) rows.push(allSlots.slice(i, i + 7));

  // Başlık satırı: W etiketi + gün kısaltmaları
  const headerRow = `
    <div class="teyit-cal-cell wk-label">H</div>
    ${['Pt','Sa','Ça','Pe','Cu','Ct','Pz'].map(d => `<div class="teyit-cal-cell header-cell">${d}</div>`).join('')}
  `;

  const rowsHTML = rows.map(row => {
    const firstSlot = row.find(c => c !== null);
    const wNum = firstSlot ? parseInt(getWeekId(parseDate(firstSlot)).split('-W')[1], 10) : '';
    const cellsHTML = row.map(dateStr => {
      if (!dateStr) return '<div class="teyit-cal-cell empty"></div>';
      const d = parseDate(dateStr);
      let cls = 'teyit-cal-cell';
      if (dateStr === todayStr) cls += ' today';
      if (dateStr === _date)    cls += ' selected';
      return `<div class="${cls}" data-cal-date="${dateStr}">${d.getDate()}</div>`;
    }).join('');
    return `<div class="teyit-cal-cell wk-num">${wNum}</div>${cellsHTML}`;
  }).join('');

  return `
    <div class="teyit-cal-header">
      <button class="btn btn--ghost btn--icon" id="btn-cal-prev" type="button">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4l-4 4 4 4"/></svg>
      </button>
      <span class="teyit-cal-title">${getMonthName(_calMonth)} ${_calYear}</span>
      <button class="btn btn--ghost btn--icon" id="btn-cal-next" type="button">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
      </button>
    </div>
    <div class="teyit-cal-grid">${headerRow}${rowsHTML}</div>
  `;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function _statsHTML() {
  const items = _itemsFor(_date);
  const pending   = items.filter(x => _asama(x) === 'bekliyor').length;
  const confirmed = items.filter(x => _asama(x) === 'teyit').length;
  const processed = items.filter(x => _asama(x) === 'islendi').length;

  return `
    <div class="teyit-stats" id="teyit-stats">
      <span class="teyit-stat teyit-stat--total">
        Toplam <strong>${items.length}</strong>
      </span>
      <span class="teyit-stat teyit-stat--pending">
        Bekliyor <strong>${pending}</strong>
      </span>
      <span class="teyit-stat teyit-stat--confirmed">
        Teyit <strong>${confirmed}</strong>
      </span>
      <span class="teyit-stat teyit-stat--wms">
        WMS <strong>${processed}</strong>
      </span>
    </div>
  `;
}

// ── List ──────────────────────────────────────────────────────────────────────

function _listHTML() {
  const items = _itemsFor(_date);
  if (!items.length) {
    return `
      <div class="teyit-empty">
        <div class="teyit-empty__icon">📋</div>
        <div>Henüz kayıt yok.<br>Araç Ekle butonuna basın.</div>
      </div>
    `;
  }

  const pending   = items.map((item, i) => ({ item, i })).filter(({ item }) => _asama(item) === 'bekliyor');
  const confirmed = items.map((item, i) => ({ item, i })).filter(({ item }) => _asama(item) === 'teyit');
  const processed = items.map((item, i) => ({ item, i })).filter(({ item }) => _asama(item) === 'islendi');

  let html = '';

  if (pending.length) {
    html += _sectionDivHTML('pending', 'BEKLIYOR', pending.length);
    html += pending.map(({ item, i }) => _vehicleCardHTML(item, i)).join('');
  }
  if (confirmed.length) {
    html += _sectionDivHTML('confirmed', 'TEYİT EDİLDİ', confirmed.length);
    html += confirmed.map(({ item, i }) => _vehicleCardHTML(item, i)).join('');
  }
  if (processed.length) {
    html += _sectionDivHTML('processed', 'WMS\'E İŞLENDİ', processed.length);
    html += processed.map(({ item, i }) => _vehicleCardHTML(item, i)).join('');
  }

  return html;
}

function _sectionDivHTML(cls, label, count) {
  return `
    <div class="teyit-section-div ${cls}">
      <span class="teyit-section-div__label">${label}</span>
      <span class="teyit-section-div__line"></span>
      <span class="teyit-section-div__count">${count} araç</span>
    </div>
  `;
}

function _vehicleCardHTML(item, idx) {
  const asama = _asama(item);
  const statusIcon = asama === 'bekliyor' ? '?' : '✓';
  const statusCls  = asama === 'bekliyor' ? 'pending' : asama === 'teyit' ? 'confirmed' : 'processed';
  const cardCls    = asama === 'bekliyor' ? 'is-pending' : asama === 'teyit' ? 'is-confirmed' : 'is-processed';
  const canEdit = _canEdit();

  const cutoffTag = item.cutoff ? `<span class="tag tag--neutral">📌 Cut-Off</span>` : '';
  const imoTag = item.aracTipi === 'imo'
    ? `<span class="tag tag--imo">IMO'lu</span>`
    : item.aracTipi === 'imosuz'
      ? `<span class="tag tag--imosuz">IMO'suz</span>`
      : '';

  const inlineDetails = [
    item.konteynerNo ? `<span class="vehicle-detail--inline">📦 <strong>${_esc(item.konteynerNo)}</strong></span>` : '',
    item.dorsePlaka  ? `<span class="vehicle-detail--inline">🚛 <strong>${_esc(item.dorsePlaka)}</strong></span>` : '',
    item.soforAdi    ? `<span class="vehicle-detail--inline">👤 <strong>${_esc(item.soforAdi)}</strong></span>` : '',
  ].filter(Boolean).join('');

  const details = [
    item.firma  ? `<span class="vehicle-detail">🏢 ${_esc(item.firma)}</span>` : '',
    item.urun   ? `<span class="vehicle-detail">📦 ${_esc(item.urun)}</span>` : '',
    item.miktar ? `<span class="vehicle-detail">⚖️ ${_esc(item.miktar)}</span>` : '',
  ].filter(Boolean).join('');

  const flagIcons = [
    item.labels?.ozel    ? `<span title="Özel Etiket">🏷️</span>` : '',
    item.labels?.lashing ? `<span title="Lashing">⛓️</span>` : '',
    item.labels?.karton  ? `<span title="Karton">📦</span>` : '',
    item.labels?.jel     ? `<span title="Nem Çekici">💧</span>` : '',
  ].filter(Boolean).join('');

  const meta = [
    item.createdBy  ? `Giriş: ${_esc(item.createdBy)}` : '',
    item.teyitEden  ? `✓ ${_esc(item.teyitEden)}${item.teyitZamani ? ' · ' + item.teyitZamani : ''}` : '',
    item.wmsIsleyen ? `🔵 WMS: ${_esc(item.wmsIsleyen)}${item.wmsZamani ? ' · ' + item.wmsZamani : ''}` : '',
    item.randevuSlot ? `🕐 ${_esc(item.randevuSlot)}` : '',
  ].filter(Boolean).join('  ');

  let actionsHtml = '';
  if (canEdit) {
    if (asama === 'bekliyor') {
      actionsHtml = `
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:var(--space-1);">
          <span class="teyit-waiting-badge">⏳ Bekliyor</span>
          <button class="btn btn--primary btn--sm" data-teyit-edit="${idx}" type="button" title="Teyit et">✎ Teyit Et</button>
        </div>
      `;
    } else if (asama === 'teyit') {
      actionsHtml = `
        <div style="display:flex;flex-direction:column;gap:var(--space-1);align-items:flex-end;">
          <button class="btn btn--primary btn--sm" data-wms-open="${idx}" type="button">🔵 WMS'e İşle &amp; Randevu Al</button>
          <button class="btn btn--ghost btn--sm" data-teyit-geri="${idx}" type="button">↺ Düzenle</button>
        </div>
      `;
    } else {
      const girisVar = item.girisKaydedildi;
      actionsHtml = `
        <div style="display:flex;flex-direction:column;gap:var(--space-1);align-items:flex-end;">
          <button class="btn btn--sm ${girisVar ? 'btn--primary' : 'btn--secondary'}" data-giris-toggle="${idx}" type="button">
            ${girisVar ? '✓ Giriş Yapıldı' : 'Giriş Kaydı'}
          </button>
          <button class="btn btn--ghost btn--sm" data-wms-geri="${idx}" type="button">↺ Geri Al</button>
        </div>
      `;
    }
    actionsHtml += `
      <button class="btn btn--ghost btn--icon btn--sm" data-del="${idx}" type="button" style="color:var(--color-danger)" title="Sil">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
      </button>
    `;
  }

  return `
    <div class="vehicle-card ${cardCls} stagger animate-fade-up">
      <div class="vehicle-card__status ${statusCls}">${statusIcon}</div>
      <div class="vehicle-card__body">
        <div class="vehicle-card__title">
          ${cutoffTag}${imoTag}
          <span class="vehicle-plaka">${_esc(item.plaka || '—')}</span>
          ${inlineDetails}
        </div>
        ${details ? `<div class="vehicle-card__details">${details}</div>` : ''}
        ${flagIcons ? `<div class="vehicle-card__flags">${flagIcons}</div>` : ''}
        ${item.not ? `<div style="font-size:var(--text-xs);color:var(--color-muted);">${_esc(item.not)}</div>` : ''}
        ${meta ? `<div class="vehicle-card__meta">${meta}</div>` : ''}
      </div>
      <div class="vehicle-card__actions">
        ${actionsHtml}
      </div>
    </div>
  `;
}

function _renderList() {
  const listEl  = ROOT?.querySelector('#teyit-list');
  const statsEl = ROOT?.querySelector('#teyit-stats');
  if (listEl)  listEl.innerHTML  = _listHTML();
  if (statsEl) statsEl.outerHTML = _statsHTML();
  _bindListEvents();
}

// ── Toolbar events ────────────────────────────────────────────────────────────

function _bindToolbarEvents() {
  ROOT.querySelector('#btn-teyit-prev')?.addEventListener('click', () => _changeDay(-1));
  ROOT.querySelector('#btn-teyit-next')?.addEventListener('click', () => _changeDay(1));
  ROOT.querySelector('#btn-teyit-today')?.addEventListener('click', () => _goToDate(todayKey()));
  ROOT.querySelector('#btn-teyit-add')?.addEventListener('click', () => _openModal());

  // Calendar toggle
  ROOT.querySelector('#btn-teyit-cal')?.addEventListener('click', () => {
    const popup = ROOT.querySelector('#teyit-cal-popup');
    popup?.classList.toggle('is-open');
  });

  // Close cal on outside click
  document.addEventListener('click', (e) => {
    const popup = ROOT?.querySelector('#teyit-cal-popup');
    if (!popup?.classList.contains('is-open')) return;
    if (!e.target.closest('.teyit-cal-wrap')) popup.classList.remove('is-open');
  }, { capture: true });

  _bindCalEvents();
}

function _bindCalEvents() {
  ROOT.querySelector('#btn-cal-prev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const { year, month } = prevMonth(_calYear, _calMonth);
    _calYear = year; _calMonth = month;
    _rerenderCal();
  });

  ROOT.querySelector('#btn-cal-next')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const { year, month } = nextMonth(_calYear, _calMonth);
    _calYear = year; _calMonth = month;
    _rerenderCal();
  });

  ROOT.querySelectorAll('[data-cal-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      _goToDate(cell.dataset.calDate);
      ROOT.querySelector('#teyit-cal-popup')?.classList.remove('is-open');
    });
  });
}

function _rerenderCal() {
  const popup = ROOT?.querySelector('#teyit-cal-popup');
  if (popup) popup.innerHTML = _calPopupHTML();
  _bindCalEvents();
}

// ── List events ───────────────────────────────────────────────────────────────

function _bindListEvents() {
  // Teyit et (düzenle modal aç)
  ROOT.querySelectorAll('[data-teyit-edit]').forEach(btn => {
    btn.addEventListener('click', () => _openModal(parseInt(btn.dataset.teyitEdit)));
  });

  // Teyit geri al
  ROOT.querySelectorAll('[data-teyit-geri]').forEach(btn => {
    btn.addEventListener('click', () => {
      _showConfirm('Teyit geri alınsın mı?', () => {
        const items = _itemsFor(_date);
        const item  = items[parseInt(btn.dataset.teyitGeri)];
        if (!item) return;
        item.asama       = '';
        item.teyitEden   = '';
        item.teyitZamani = '';
        _save();
        _renderList();
      });
    });
  });

  // WMS'e aç
  ROOT.querySelectorAll('[data-wms-open]').forEach(btn => {
    btn.addEventListener('click', () => _openWms(parseInt(btn.dataset.wmsOpen)));
  });

  // Giriş kaydı toggle
  ROOT.querySelectorAll('[data-giris-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = _itemsFor(_date)[parseInt(btn.dataset.girisToggle)];
      if (!item) return;
      item.girisKaydedildi = !item.girisKaydedildi;
      item.girisZamani     = item.girisKaydedildi
        ? new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : '';
      _save();
      _renderList();
    });
  });

  // WMS geri al
  ROOT.querySelectorAll('[data-wms-geri]').forEach(btn => {
    btn.addEventListener('click', () => {
      _showConfirm("WMS işlemi geri alınsın mı? Araç 'Teyit Edildi' aşamasına döner.", async () => {
        const item = _itemsFor(_date)[parseInt(btn.dataset.wmsGeri)];
        if (!item) return;
        // Randevu slotunu temizle (async — önce Firestore'dan okur)
        if (item.randevuDate && item.randevuType != null && item.randevuIdx != null) {
          await window.R?.clearSlot?.(item.randevuDate, item.randevuType, item.randevuIdx);
        }
        item.asama        = 'teyit';
        item.wmsIsleyen   = '';
        item.wmsZamani    = '';
        item.randevuSlot  = '';
        item.randevuDate  = '';
        item.randevuType  = '';
        item.randevuIdx   = null;
        _save();
        _renderList();
      });
    });
  });

  // Sil
  ROOT.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      _showConfirm('Bu kayıt silinsin mi?', () => {
        _itemsFor(_date).splice(parseInt(btn.dataset.del), 1);
        _save();
        _renderList();
      });
    });
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function _modalHTML() {
  return `
    <div class="modal-backdrop" id="modal-teyit" role="dialog" aria-modal="true" aria-labelledby="teyit-modal-title" hidden>
      <div class="modal modal--wide">
        <div class="modal__header">
          <h2 class="modal__title" id="teyit-modal-title">Araç Ekle</h2>
          <button class="modal__close" id="btn-teyit-close" type="button" aria-label="Kapat">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
          </button>
        </div>
        <div class="modal__body">

          <!-- Hızlı yapıştır -->
          <div class="booking-paste-row">
            <div class="field flex-1">
              <label class="field__label" for="t-paste">Hızlı Yapıştır</label>
              <input class="field__input" type="text" id="t-paste"
                     placeholder="Plaka / konteyner / treyler / sürücü yapıştırın..." autocomplete="off"/>
            </div>
            <button class="btn btn--secondary" id="btn-t-parse" type="button">Ayrıştır</button>
          </div>

          <!-- Araç tipi -->
          <div class="field mb-4">
            <span class="field__label">Araç Tipi</span>
            <div class="arac-tipi-row">
              <button class="arac-tipi-btn imo"    data-arac-tipi="imo"    type="button">IMO'lu</button>
              <button class="arac-tipi-btn imosuz" data-arac-tipi="imosuz" type="button">IMO'suz</button>
            </div>
          </div>

          <!-- Üst grup: Araç bilgileri -->
          <div class="form-grid">
            <div class="field">
              <label class="field__label required" for="t-plaka">Plaka</label>
              <input class="field__input field__input--mono" type="text" id="t-plaka"
                     placeholder="34 ABC 1234" autocomplete="off" maxlength="12"/>
            </div>
            <div class="field">
              <label class="field__label required" for="t-dorse">Treyler Plaka</label>
              <input class="field__input field__input--mono" type="text" id="t-dorse"
                     placeholder="34 TT 9901" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="t-konteyner">Konteyner No</label>
              <input class="field__input field__input--mono" type="text" id="t-konteyner"
                     placeholder="PETU 123456-7" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="t-sofor">Sürücü Adı</label>
              <input class="field__input" type="text" id="t-sofor"
                     placeholder="Ad Soyad" autocomplete="off"/>
            </div>
          </div>

          <!-- Haftalık Listeden Çek -->
          <div style="display:flex;align-items:center;gap:var(--space-2);margin:var(--space-3) 0;">
            <button class="btn-haftalik-cek" id="btn-haftalik-cek" type="button">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v8M4 7l4 4 4-4"/></svg>
              Haftalık Listeden Çek
            </button>
          </div>
          <div id="haftalik-cek-secim"></div>

          <!-- Alt grup: Yükleme bilgileri -->
          <div class="form-grid">
            <div class="field">
              <label class="field__label required" for="t-firma">Firma</label>
              <input class="field__input" type="text" id="t-firma"
                     placeholder="Firma adı" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="t-urun">Ürün</label>
              <input class="field__input" type="text" id="t-urun"
                     placeholder="Ürün adı" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="t-miktar">Miktar</label>
              <input class="field__input" type="text" id="t-miktar"
                     placeholder="Ton / adet" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label" for="t-not">Not</label>
              <input class="field__input" type="text" id="t-not"
                     placeholder="Ekstra not..." autocomplete="off"/>
            </div>
          </div>

          <!-- Yapılacaklar -->
          <div class="field mt-4">
            <span class="field__label">Yapılacaklar</span>
            <div class="label-chips">
              <button class="label-chip" data-label="ozel"    type="button">🏷️ Özel Etiket</button>
              <button class="label-chip" data-label="lashing" type="button">⛓️ Lashing</button>
              <button class="label-chip" data-label="karton"  type="button">📦 Karton</button>
              <button class="label-chip" data-label="jel"     type="button">💧 Nem Çekici</button>
              <label class="label-chip" style="cursor:pointer;">
                <input type="checkbox" id="t-cutoff" style="position:absolute;clip:rect(0,0,0,0)"/>
                📌 Cut-Off
              </label>
            </div>
          </div>

        </div>
        <div class="modal__footer" id="teyit-modal-footer">
          <button class="btn btn--secondary" id="btn-teyit-modal-cancel" type="button">İptal</button>
          <button class="btn btn--secondary" id="btn-teyit-kaydet" type="button">Bekliyor Olarak Kaydet</button>
          <button class="btn btn--primary" id="btn-teyit-et" type="button">Teyit Et &amp; Kaydet</button>
        </div>
      </div>
    </div>
  `;
}

function _openModal(idx) {
  _editIdx = idx !== undefined ? idx : null;
  _selectedType = '';
  _cekMatched = null;

  const modal = ROOT.querySelector('#modal-teyit');
  if (!modal) return;

  const isEdit = _editIdx !== null;
  const item   = isEdit ? _itemsFor(_date)[_editIdx] : null;

  ROOT.querySelector('#teyit-modal-title').textContent = isEdit ? 'Kaydı Düzenle' : 'Araç Ekle';

  // Alanları temizle / doldur
  const fields = {
    't-plaka':     item?.plaka       || '',
    't-konteyner': item?.konteynerNo || '',
    't-dorse':     item?.dorsePlaka  || '',
    't-sofor':     item?.soforAdi    || '',
    't-firma':     item?.firma       || '',
    't-urun':      item?.urun        || '',
    't-miktar':    item?.miktar      || '',
    't-not':       item?.not         || '',
    't-paste':     '',
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = ROOT.querySelector(`#${id}`); if (el) { el.value = val; el.classList.remove('has-error'); }
  });

  const cutoff = ROOT.querySelector('#t-cutoff');
  if (cutoff) {
    cutoff.checked = !!(item?.cutoff);
    cutoff.closest('.label-chip')?.classList.toggle('is-checked', !!(item?.cutoff));
  }

  ROOT.querySelectorAll('.label-chip[data-label]').forEach(c => {
    c.classList.toggle('is-checked', !!(item?.labels?.[c.dataset.label]));
  });

  ROOT.querySelectorAll('.arac-tipi-btn').forEach(b => b.classList.remove('is-active'));
  if (item?.aracTipi) {
    _selectedType = item.aracTipi;
    ROOT.querySelector(`.arac-tipi-btn[data-arac-tipi="${item.aracTipi}"]`)?.classList.add('is-active');
  }

  ROOT.querySelector('#haftalik-cek-secim').innerHTML = '';
  ROOT.querySelector('#btn-haftalik-cek')?.classList.remove('is-done');

  // Footer — düzenleme modunda "Teyit Et" butonu gizle eğer zaten teyit/islendi
  const footer = ROOT.querySelector('#teyit-modal-footer');
  if (footer && isEdit && item && _asama(item) !== 'bekliyor') {
    footer.innerHTML = `
      <button class="btn btn--secondary" id="btn-teyit-modal-cancel" type="button">İptal</button>
      <button class="btn btn--primary" id="btn-teyit-kaydet" type="button">Kaydet</button>
    `;
  } else {
    footer.innerHTML = `
      <button class="btn btn--secondary" id="btn-teyit-modal-cancel" type="button">İptal</button>
      <button class="btn btn--secondary" id="btn-teyit-kaydet" type="button">Bekliyor Olarak Kaydet</button>
      <button class="btn btn--primary" id="btn-teyit-et" type="button">Teyit Et &amp; Kaydet</button>
    `;
  }
  _bindModalFooter();

  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.add('is-open');
    ROOT.querySelector('#t-paste')?.focus();
  });
}

function _closeModal() {
  const modal = ROOT.querySelector('#modal-teyit');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.addEventListener('transitionend', () => { modal.hidden = true; }, { once: true });
  _editIdx = null;
}

function _saveItem(doTeyit) {
  const plaka = ROOT.querySelector('#t-plaka')?.value.trim().toUpperCase();
  if (!plaka) {
    ROOT.querySelector('#t-plaka')?.classList.add('has-error');
    ROOT.querySelector('#t-plaka')?.focus();
    return;
  }

  const dorse     = ROOT.querySelector('#t-dorse')?.value.trim();
  const konteyner = ROOT.querySelector('#t-konteyner')?.value.trim();
  const sofor     = ROOT.querySelector('#t-sofor')?.value.trim();

  if (!dorse) {
    ROOT.querySelector('#t-dorse')?.classList.add('has-error');
    ROOT.querySelector('#t-dorse')?.focus();
    return;
  }
  if (!konteyner) {
    ROOT.querySelector('#t-konteyner')?.classList.add('has-error');
    ROOT.querySelector('#t-konteyner')?.focus();
    return;
  }
  if (!sofor) {
    ROOT.querySelector('#t-sofor')?.classList.add('has-error');
    ROOT.querySelector('#t-sofor')?.focus();
    return;
  }

  const firma  = ROOT.querySelector('#t-firma')?.value.trim();
  const urun   = ROOT.querySelector('#t-urun')?.value.trim();
  const miktar = ROOT.querySelector('#t-miktar')?.value.trim();

  // Firma/Ürün/Miktar sadece "Teyit Et" aşamasında zorunlu
  if (doTeyit) {
    if (!firma) {
      ROOT.querySelector('#t-firma')?.classList.add('has-error');
      ROOT.querySelector('#t-firma')?.focus();
      return;
    }
    if (!urun) {
      ROOT.querySelector('#t-urun')?.classList.add('has-error');
      ROOT.querySelector('#t-urun')?.focus();
      return;
    }
    if (!miktar) {
      ROOT.querySelector('#t-miktar')?.classList.add('has-error');
      ROOT.querySelector('#t-miktar')?.focus();
      return;
    }
  }

  const user = getActiveUser();
  const creator = user?.name || '';
  const now = new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});

  const labels = {};
  ROOT.querySelectorAll('.label-chip[data-label]').forEach(c => {
    labels[c.dataset.label] = c.classList.contains('is-checked');
  });

  const items = _itemsFor(_date);
  const existing = _editIdx !== null ? items[_editIdx] : null;

  const entry = {
    id:          existing?.id || _uid(),
    plaka,
    konteynerNo: konteyner,
    dorsePlaka:  dorse,
    soforAdi:    sofor,
    aracTipi:    _selectedType,
    firma,
    urun,
    miktar,
    not:         ROOT.querySelector('#t-not')?.value.trim()       || '',
    labels,
    cutoff:      ROOT.querySelector('#t-cutoff')?.checked || false,
    createdBy:   existing?.createdBy || creator,
    createdAt:   existing?.createdAt || Date.now(),
    asama:       doTeyit ? 'teyit' : (existing?.asama || 'bekliyor'),
    teyitEden:   doTeyit ? creator : (existing?.teyitEden || ''),
    teyitZamani: doTeyit ? now : (existing?.teyitZamani || ''),
    wmsIsleyen:  existing?.wmsIsleyen || '',
    wmsZamani:   existing?.wmsZamani  || '',
    randevuSlot: existing?.randevuSlot || '',
  };

  const isNew = _editIdx === null;
  if (isNew) {
    items.push(entry);
  } else {
    items[_editIdx] = entry;
  }

  _closeModal();
  _save();
  _renderList();
}

function _bindModalEvents() {
  ROOT.querySelector('#btn-teyit-close')?.addEventListener('click', _closeModal);
  ROOT.querySelector('#modal-teyit')?.addEventListener('click', (e) => {
    if (e.target === ROOT.querySelector('#modal-teyit')) _closeModal();
  });
  ROOT.querySelector('#modal-teyit')?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _closeModal();
  });

  // Ayrıştır
  ROOT.querySelector('#btn-t-parse')?.addEventListener('click', () => {
    const raw = ROOT.querySelector('#t-paste')?.value || '';
    const parsed = parsePasteText(raw);
    if (parsed.plaka)     _setField('t-plaka', parsed.plaka);
    if (parsed.konteyner) _setField('t-konteyner', parsed.konteyner);
    if (parsed.treyler)   _setField('t-dorse', parsed.treyler);
    if (parsed.surucu)    _setField('t-sofor', parsed.surucu);
    ROOT.querySelector('#t-paste').value = '';
    ROOT.querySelector('#t-plaka')?.focus();
  });

  // Haftalık çek
  ROOT.querySelector('#btn-haftalik-cek')?.addEventListener('click', _haftalikCek);

  // Araç tipi
  ROOT.querySelectorAll('.arac-tipi-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ROOT.querySelectorAll('.arac-tipi-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      _selectedType = btn.dataset.aracTipi;
    });
  });

  // Label chip toggle
  ROOT.querySelectorAll('.label-chip[data-label]').forEach(c => {
    c.addEventListener('click', () => c.classList.toggle('is-checked'));
  });

  // Cut-Off görsel senkronizasyon
  const cutoffCb = ROOT.querySelector('#t-cutoff');
  const cutoffLabel = cutoffCb?.closest('.label-chip');
  if (cutoffCb && cutoffLabel) {
    cutoffCb.addEventListener('change', () => {
      cutoffLabel.classList.toggle('is-checked', cutoffCb.checked);
    });
  }

  _bindModalFooter();
}

function _bindModalFooter() {
  ROOT.querySelector('#btn-teyit-modal-cancel')?.addEventListener('click', _closeModal);
  ROOT.querySelector('#btn-teyit-kaydet')?.addEventListener('click', () => _saveItem(false));
  ROOT.querySelector('#btn-teyit-et')?.addEventListener('click', () => _saveItem(true));
}

// ── Haftalık Çek ──────────────────────────────────────────────────────────────

function _haftalikCek() {
  if (!window.H?.getDataForDate) {
    window.App?.showToast({ title: 'Haftalık plan verisi yüklenemedi', type: 'error' });
    return;
  }

  const entries = window.H.getDataForDate(_date);
  if (!entries?.length) {
    window.App?.showToast({ title: 'Bu tarihe ait haftalık plan kaydı bulunamadı', type: 'warning' });
    return;
  }

  const firmaVal = (ROOT.querySelector('#t-firma')?.value || '').trim().toLowerCase();
  let matched = firmaVal
    ? entries.filter(e => (e.firma || e.desc || '').toLowerCase().includes(firmaVal))
    : entries;
  if (!matched.length) matched = entries;

  if (matched.length === 1) {
    _doldurEntry(matched[0]);
    return;
  }

  // Seçim listesi göster
  _cekMatched = matched;
  const secimEl = ROOT.querySelector('#haftalik-cek-secim');
  if (!secimEl) return;
  secimEl.innerHTML = `
    <div class="haftalik-cek-list">
      ${matched.map((e, i) => {
        const label = [e.personName, e.firma, e.urun, e.count ? e.count + ' araç' : ''].filter(Boolean).join(' · ');
        return `<button class="haftalik-cek-item" data-cek-idx="${i}" type="button">${_esc(label)}</button>`;
      }).join('')}
    </div>
  `;
  secimEl.querySelectorAll('[data-cek-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      _doldurEntry(_cekMatched[parseInt(btn.dataset.cekIdx)]);
      secimEl.innerHTML = '';
    });
  });
}

function _doldurEntry(entry) {
  if (!ROOT.querySelector('#t-firma')?.value.trim() && entry.firma)
    _setField('t-firma', entry.firma);
  if (!ROOT.querySelector('#t-urun')?.value.trim() && entry.urun)
    _setField('t-urun', entry.urun);
  if (!ROOT.querySelector('#t-not')?.value.trim() && entry.desc)
    _setField('t-not', entry.desc);
  if (entry.pinned) {
    const cutoff = ROOT.querySelector('#t-cutoff');
    if (cutoff) {
      cutoff.checked = true;
      cutoff.closest('.label-chip')?.classList.add('is-checked');
    }
  }
  if (entry.labels) {
    ROOT.querySelectorAll('.label-chip[data-label]').forEach(c => {
      if (entry.labels[c.dataset.label]) c.classList.add('is-checked');
    });
  }
  ROOT.querySelector('#btn-haftalik-cek')?.classList.add('is-done');
}

// ── WMS Randevu Modal ─────────────────────────────────────────────────────────

function _wmsModalHTML() {
  return `
    <div class="modal-backdrop" id="modal-wms" role="dialog" aria-modal="true" aria-labelledby="wms-modal-title" hidden>
      <div class="modal modal--narrow">
        <div class="modal__header">
          <h2 class="modal__title" id="wms-modal-title">Randevu Seç</h2>
          <button class="modal__close" id="btn-wms-close" type="button" aria-label="Kapat">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
          </button>
        </div>
        <div class="modal__body">
          <div id="wms-item-info" style="font-size:var(--text-sm);color:var(--color-muted);margin-bottom:var(--space-4);"></div>
          <div class="wms-slot-list" id="wms-slot-list"></div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary" id="btn-wms-cancel" type="button">İptal</button>
        </div>
      </div>
    </div>
  `;
}

function _openWms(idx) {
  const items = _itemsFor(_date);
  const item  = items[idx];
  if (!item) return;

  if (!window.R?.getEmptySlots) {
    window.App?.showToast({ title: 'Randevu sistemi yüklü değil', type: 'error' });
    return;
  }

  const slots = window.R.getEmptySlots(_date);
  if (!slots?.length) {
    window.App?.showToast({ title: 'Boş randevu slotu yok', desc: 'Randevu ekranından slot ekleyebilirsiniz.', type: 'warning' });
    return;
  }

  _wmsItemIdx = idx;
  _wmsSlots   = slots;

  const modal = ROOT.querySelector('#modal-wms');
  if (!modal) return;

  ROOT.querySelector('#wms-item-info').textContent =
    `${item.plaka || ''}${item.firma ? ' · ' + item.firma : ''}`;

  ROOT.querySelector('#wms-slot-list').innerHTML = slots.map((s, si) => {
    const typeLabel = s.type === 'adr' ? "IMO'lu (Rampa 1)" : "IMO'suz (Rampa 2)";
    return `
      <button class="wms-slot-btn" data-slot-idx="${si}" data-slot-type="${s.type}" type="button">
        <span class="wms-slot-time">${s.start} – ${s.end}</span>
        <span class="wms-slot-type">${typeLabel}</span>
      </button>
    `;
  }).join('');

  ROOT.querySelectorAll('[data-slot-idx]').forEach(btn => {
    btn.addEventListener('click', () => _selectWmsSlot(parseInt(btn.dataset.slotIdx)));
  });

  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));
}

function _closeWms() {
  const modal = ROOT.querySelector('#modal-wms');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.addEventListener('transitionend', () => { modal.hidden = true; }, { once: true });
}

function _selectWmsSlot(si) {
  _closeWms();
  const items = _itemsFor(_date);
  const item  = items[_wmsItemIdx];
  if (!item || !_wmsSlots?.[si]) return;

  const slot  = _wmsSlots[si];
  const user  = getActiveUser();
  const userName = user?.name || 'Bilinmiyor';
  const now   = new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});

  const ok = window.R?.bookSlot?.(_date, slot.type, slot.idx, {
    plate:     item.plaka        || '',
    company:   item.firma        || '',
    cargo:     item.urun         || '',
    miktar:    item.miktar       || '',
    konteyner: item.konteynerNo  || '',
    dorse:     item.dorsePlaka   || '',
    sofor:     item.soforAdi     || '',
    cutoff:    item.cutoff       || false,
    labels:    item.labels       || {},
    createdBy: userName,
  });

  if (ok === false) {
    window.App?.showToast({ title: 'Slot rezervasyonu başarısız', type: 'error' });
    return;
  }

  item.asama        = 'islendi';
  item.wmsIsleyen   = userName;
  item.wmsZamani    = now;
  item.randevuSlot  = `${slot.start} – ${slot.end}`;
  item.randevuDate  = _date;
  item.randevuType  = slot.type;
  item.randevuIdx   = slot.idx;

  _save();
  _renderList();
}

function _bindWmsEvents() {
  ROOT.querySelector('#btn-wms-close')?.addEventListener('click', _closeWms);
  ROOT.querySelector('#btn-wms-cancel')?.addEventListener('click', _closeWms);
  ROOT.querySelector('#modal-wms')?.addEventListener('click', (e) => {
    if (e.target === ROOT.querySelector('#modal-wms')) _closeWms();
  });
}

// ── Confirm ───────────────────────────────────────────────────────────────────

let _confirmCallback = null;

function _confirmHTML() {
  return `
    <div class="modal-backdrop confirm-dialog" id="modal-tconfirm" role="alertdialog" aria-modal="true" hidden>
      <div class="modal modal--narrow">
        <div class="modal__header">
          <h2 class="modal__title" id="tconfirm-msg">Emin misiniz?</h2>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary" id="btn-tconfirm-no" type="button">İptal</button>
          <button class="btn btn--danger" id="btn-tconfirm-yes" type="button">Evet</button>
        </div>
      </div>
    </div>
  `;
}

function _showConfirm(msg, cb) {
  ROOT.querySelector('#tconfirm-msg').textContent = msg;
  _confirmCallback = cb;
  const modal = ROOT.querySelector('#modal-tconfirm');
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));
}

function _bindConfirmEvents() {
  ROOT.querySelector('#btn-tconfirm-no')?.addEventListener('click', () => {
    ROOT.querySelector('#modal-tconfirm')?.classList.remove('is-open');
    ROOT.querySelector('#modal-tconfirm').hidden = true;
    _confirmCallback = null;
  });
  ROOT.querySelector('#btn-tconfirm-yes')?.addEventListener('click', () => {
    ROOT.querySelector('#modal-tconfirm')?.classList.remove('is-open');
    ROOT.querySelector('#modal-tconfirm').hidden = true;
    if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────

function _changeDay(dir) {
  _goToDate(addDays(_date, dir));
}

function _goToDate(dateStr) {
  _date = dateStr;
  setLastTeyitDate(dateStr);
  const d = parseDate(dateStr);
  _calYear  = d.getFullYear();
  _calMonth = d.getMonth() + 1;
  _watchDate(dateStr);
  _render();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _itemsFor(dateStr) {
  if (!_data[dateStr]) _data[dateStr] = [];
  return _data[dateStr];
}

function _asama(item) {
  if (item.asama === 'islendi') return 'islendi';
  if (item.asama === 'teyit')   return 'teyit';
  return 'bekliyor';
}

function _canEdit() {
  const user = getActiveUser();
  if (!user) return false;
  if (user.role === 'guest') return false;
  return true;
}

function _save() {
  saveTeyitDay(_date, { items: JSON.parse(JSON.stringify(_itemsFor(_date))) });
}

function _setField(id, val) {
  const el = ROOT.querySelector(`#${id}`);
  if (el) el.value = val || '';
}

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Global API (window.T) ─────────────────────────────────────────────────────

window.T = {
  init,
  render:    _renderList,
  _rtUpdate: (fresh) => {
    Object.entries(fresh).forEach(([dk, val]) => {
      if (val?.items) _data[dk] = val.items;
    });
    _renderList();
  },
};
