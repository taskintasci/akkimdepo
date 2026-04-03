/**
 * Haftalık Plan Modülü — window.H
 *
 * Kişi×Gün tablosu, entry chip'leri, aylık özet, admin personel paneli,
 * randevu→plan sync tostu.
 */

import { watchWeeklyPlan, saveWeeklyWeek, loadWeeklyData,
         loadPersons, savePersons }       from '../../core/storage.js';
import { emit, on }                       from '../../core/events.js';
import { getIsAdminSession, getActiveUser } from '../../core/auth.js';
import { isHoliday, getHolidayName }      from '../../utils/holidays.js';
import { formatDateKey, parseDate, getWeekId, getWeekDays,
         formatWeekTitle, prevWeek, nextWeek, currentWeekId,
         todayKey, getDayShortName }      from '../../utils/date.js';
import { getInitials, getAvatarColor }    from '../../utils/format.js';
import { setLastWeek, getLastWeek }       from '../../utils/storage-local.js';

// ── State ────────────────────────────────────────────────────────────────────

let _persons = [];
let _data  = {};   // weekId → { "personId_dayIdx": [...entries] }
let _currentWeek = currentWeekId();
let _unsubPlan = null;

const DAY_NAMES_FULL  = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
const DAY_NAMES_SHORT = ['Pzt','Sal','Çrş','Per','Cum','Cmt','Paz'];
const DAILY_CAP = 13;

const ROOT = document.getElementById('view-haftalik');

// ── Init ─────────────────────────────────────────────────────────────────────

export async function init() {
  const lastWeek = getLastWeek();
  if (lastWeek) _currentWeek = lastWeek;

  // Personel yükle
  _persons = await loadPersons();

  // Personel değişince güncelle
  on('persons:updated', ({ list }) => {
    _persons = list;
    _render();
  });

  on('auth:changed', _render);
  on('user:changed', _render);
  on('haftalik:open-monthly', () => setTimeout(_openMonthly, 50));

  // Haftalık veriyi yükle ve izle
  _watchWeek(_currentWeek);
  _render();
}

// ── Watch ─────────────────────────────────────────────────────────────────────

function _watchWeek(weekId) {
  if (_unsubPlan) { _unsubPlan(); _unsubPlan = null; }

  _unsubPlan = watchWeeklyPlan(weekId, (fresh) => {
    if (_saving) return;          // yerel kayıt devam ederken dışarıdan ezme
    if (fresh) _data[weekId] = fresh;
    else       _data[weekId] = {};
    const modal = ROOT?.querySelector('#modal-entry');
    if (!modal?.classList.contains('is-open')) _renderTable();
  });
}

// ── Render ────────────────────────────────────────────────────────────────────

function _render() {
  if (!ROOT) return;
  ROOT.innerHTML = `
    <div class="haftalik-page animate-fade-in">
      <div class="haftalik-toolbar">
        <div class="haftalik-toolbar__nav">
          <button class="btn btn--ghost btn--icon" id="btn-week-prev" type="button" aria-label="Önceki hafta">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4l-4 4 4 4"/></svg>
          </button>
          <span class="toolbar-week-badge">${parseInt(_currentWeek.split('-W')[1], 10)}</span>
          <div class="haftalik-toolbar__week" id="week-label">${formatWeekTitle(_currentWeek)}</div>
          <button class="btn btn--ghost btn--icon" id="btn-week-next" type="button" aria-label="Sonraki hafta">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
          </button>
          <button class="btn btn--ghost btn--sm" id="btn-today" type="button">Bugün</button>
        </div>
      </div>

      <div class="haftalik-table-outer">
        <div id="haftalik-table-wrap">
          ${_tableHTML()}
        </div>
      </div>
    </div>

    ${_entryModalHTML()}
    ${_monthlyModalHTML()}
    ${_adminModalHTML()}
    ${_syncModalHTML()}
    ${_confirmHTML()}
  `;

  _bindToolbarEvents();
  _bindTableEvents();
  _bindModalEvents();
  _initTouchDrag();
}

// ── Table HTML ────────────────────────────────────────────────────────────────

function _tableHTML() {
  const days  = getWeekDays(_currentWeek);
  const d     = _dataFor(_currentWeek);
  const todayStr = todayKey();

  // thead
  const headCells = days.map((dateStr, i) => {
    const isToday = dateStr === todayStr;
    const hol     = isHoliday(dateStr);
    const holName = getHolidayName(dateStr);
    const dayDate = parseDate(dateStr);

    return `<th class="${hol ? 'th-holiday' : ''}">
      <div class="day-header-cell">
        <span class="day-header-cell__name">${DAY_NAMES_SHORT[i]}</span>
        <span class="day-header-cell__num ${isToday ? 'is-today' : ''}">${dayDate.getDate()}</span>
        ${holName ? `<span class="day-header-cell__holiday">${_esc(holName)}</span>` : ''}
      </div>
    </th>`;
  }).join('');

  // tbody
  const canEdit = _canEdit();
  const visiblePersons = _persons.filter(p => p.role !== 'wms_operator');

  const bodyRows = visiblePersons.map(p => {
    const nameCells = `
      <td class="name-cell">
        <div class="name-cell__inner">
          <span class="avatar avatar--sm" data-color="${getAvatarColor(p.name)}" aria-hidden="true">
            ${getInitials(p.name)}
          </span>
          <div>
            <div class="name-cell__text">${_esc(p.name)}</div>
            ${p.role ? `<div class="name-cell__role">${_esc(p.role)}</div>` : ''}
          </div>
        </div>
      </td>
    `;

    const dayCells = days.map((dateStr, i) => {
      const ck = `${p.id}_${i}`;
      const entries = d[ck] || [];
      const isToday  = dateStr === todayStr;
      const isHol    = isHoliday(dateStr);
      const activeUser = _activeUser();
      const canEditRow = canEdit && (_isAdmin() || activeUser?.role === 'wms' || activeUser?.id === p.id);
      const dropAttr = canEditRow
        ? `data-drop-person="${p.id}" data-drop-day="${i}"`
        : '';

      const entryHtml = entries.map((e, ei) => _entryChipHTML(e, p.id, i, ei, canEditRow)).join('');
      const addBtn = canEditRow
        ? `<button class="add-entry-btn" data-add-person="${p.id}" data-add-day="${i}" type="button" aria-label="Kayıt ekle">+ ekle</button>`
        : '';

      return `<td class="day-cell ${isToday ? 'col-today' : ''} ${isHol ? 'col-holiday' : ''}" ${dropAttr}>
        <div class="day-cell__inner">${entryHtml}${addBtn}</div>
      </td>`;
    }).join('');

    return `<tr>${nameCells}${dayCells}</tr>`;
  }).join('');

  // Totals row
  const totalCells = days.map((_, i) => {
    let total = 0;
    _persons.forEach(p => {
      (d[`${p.id}_${i}`] || []).forEach(e => { total += parseInt(e.count) || 0; });
    });
    const capClass = total >= DAILY_CAP ? (total > DAILY_CAP ? 'over' : 'warn') : '';
    const capLabel = total > DAILY_CAP
      ? `+${total - DAILY_CAP} fazla`
      : (total === DAILY_CAP ? 'kapasite dolu' : 'araç');
    return `<td style="text-align:center;padding:var(--space-2);">
      <div class="total-num ${capClass}">${total || '—'}</div>
      <div class="total-lbl">${total ? capLabel : ''}</div>
    </td>`;
  }).join('');

  return `
    <table class="haftalik-table">
      <thead>
        <tr>
          <th style="text-align:left;">KİŞİ</th>
          ${headCells}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td class="name-cell" style="font-size:var(--text-xs);font-weight:var(--weight-bold);color:var(--color-muted);text-transform:uppercase;letter-spacing:0.06em;">
            TOPLAM
          </td>
          ${totalCells}
        </tr>
      </tfoot>
    </table>
  `;
}

function _entryChipHTML(e, personId, dayIdx, entryIdx, canEdit) {
  const typeClass   = e.type || 'other';
  const completed   = e.completed ? ' is-completed' : '';
  const pinned      = e.pinned    ? ' is-pinned'    : '';

  const flags = [
    e.labels?.ozel    ? `<span class="chip-flag-icon" title="Özel Etiket">🏷️</span>` : '',
    e.labels?.lashing ? `<span class="chip-flag-icon" title="Lashing">⛓️</span>` : '',
    e.labels?.karton  ? `<span class="chip-flag-icon" title="Karton">📦</span>` : '',
    e.labels?.jel     ? `<span class="chip-flag-icon" title="Nem Çekici">💧</span>` : '',
  ].filter(Boolean).join('');

  const dragAttr = (canEdit && !e.completed)
    ? `draggable="true" data-drag-person="${personId}" data-drag-day="${dayIdx}" data-drag-idx="${entryIdx}"`
    : '';

  const editAttr = canEdit
    ? `data-edit-person="${personId}" data-edit-day="${dayIdx}" data-edit-idx="${entryIdx}"`
    : '';

  const delBtn = canEdit
    ? `<button class="chip-del" data-del-person="${personId}" data-del-day="${dayIdx}" data-del-idx="${entryIdx}" type="button" aria-label="Sil">✕</button>`
    : '';

  const cnt = parseInt(e.count) || 0;
  const countLevel = cnt <= 1 ? 1 : cnt <= 3 ? 2 : cnt <= 5 ? 3 : cnt <= 8 ? 4 : 5;
  const previewData = JSON.stringify({ count: e.count, firma: e.firma, urun: e.urun, desc: e.desc, type: e.type, pinned: e.pinned, labels: e.labels });

  return `
    <div class="entry-chip ${typeClass}${completed}${pinned} count-level-${countLevel}" ${dragAttr} ${editAttr} data-preview='${previewData.replace(/'/g, '&#39;')}'>
      ${(e.pinned || delBtn) ? `<div class="chip-top-bar">${e.pinned ? `<span class="chip-cutoff">Cut-Off</span>` : '<span></span>'}${delBtn}</div>` : ''}
      ${e.count ? `<div class="chip-count">${_esc(e.count)}</div>` : ''}
      <div>
        ${e.firma ? `<div class="chip-firma">${_esc(e.firma)}</div>` : ''}
        ${e.urun  ? `<div class="chip-urun">${_esc(e.urun)}</div>`   : ''}
        ${e.desc  ? `<div class="chip-desc">${_esc(e.desc)}</div>` : ''}
      </div>
      ${flags ? `<div class="chip-flags">${flags}</div>` : ''}
    </div>
  `;
}

// ── Re-render helpers ─────────────────────────────────────────────────────────

function _renderTable() {
  const wrap = ROOT?.querySelector('#haftalik-table-wrap');
  if (wrap) {
    wrap.innerHTML = _tableHTML();
    _bindTableEvents();
    _initTouchDrag();
  }
}

// ── Event Binding ─────────────────────────────────────────────────────────────

function _bindToolbarEvents() {
  document.getElementById('btn-week-prev')?.addEventListener('click', () => {
    _currentWeek = prevWeek(_currentWeek);
    setLastWeek(_currentWeek);
    _watchWeek(_currentWeek);
    document.getElementById('week-label').textContent = formatWeekTitle(_currentWeek);
    _renderTable();
  });

  document.getElementById('btn-week-next')?.addEventListener('click', () => {
    _currentWeek = nextWeek(_currentWeek);
    setLastWeek(_currentWeek);
    _watchWeek(_currentWeek);
    document.getElementById('week-label').textContent = formatWeekTitle(_currentWeek);
    _renderTable();
  });

  document.getElementById('btn-today')?.addEventListener('click', () => {
    _currentWeek = currentWeekId();
    setLastWeek(_currentWeek);
    _watchWeek(_currentWeek);
    document.getElementById('week-label').textContent = formatWeekTitle(_currentWeek);
    _renderTable();
  });

  document.getElementById('btn-admin-persons')?.addEventListener('click', _openAdmin);
}

function _bindTableEvents() {
  if (!ROOT) return;

  // Ekle butonu
  ROOT.querySelectorAll('[data-add-person]').forEach(btn => {
    btn.addEventListener('click', () => {
      _openModal(btn.dataset.addPerson, parseInt(btn.dataset.addDay));
    });
  });

  // Düzenle (çift tıklama)
  ROOT.querySelectorAll('[data-edit-person]').forEach(el => {
    el.addEventListener('dblclick', () => {
      _openModal(el.dataset.editPerson, parseInt(el.dataset.editDay), parseInt(el.dataset.editIdx));
    });
  });


  // Sil butonu
  ROOT.querySelectorAll('[data-del-person]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.dataset.delPerson;
      const di  = parseInt(btn.dataset.delDay);
      const ei  = parseInt(btn.dataset.delIdx);
      const entry = (_dataFor(_currentWeek)[`${pid}_${di}`] || [])[ei];
      _showConfirm(`${entry?.desc || 'Bu kayıt'} silinsin mi?`, () => {
        const d = _dataFor(_currentWeek);
        const ck = `${pid}_${di}`;
        if (d[ck]) {
          d[ck].splice(ei, 1);
          if (d[ck].length === 0) delete d[ck];
        }
        _renderTable();
        _save();
      });
    });
  });

  // Desktop drag-drop
  ROOT.querySelectorAll('[data-drag-person]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      _dragSrc = {
        personId: el.dataset.dragPerson,
        dayIdx:   parseInt(el.dataset.dragDay),
        entryIdx: parseInt(el.dataset.dragIdx),
      };
      el.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
  });

  ROOT.querySelectorAll('[data-drop-person]').forEach(el => {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!_dragSrc) return;
      _dropEntry(el.dataset.dropPerson, parseInt(el.dataset.dropDay));
    });
  });

}

// ── Drag state ────────────────────────────────────────────────────────────────

let _dragSrc = null;
let _saving  = false;

function _dropEntry(targetPersonId, targetDayIdx) {
  if (!_dragSrc) return;
  const { personId, dayIdx, entryIdx } = _dragSrc;
  _dragSrc = null;
  if (personId === targetPersonId && dayIdx === targetDayIdx) return;

  const d   = _dataFor(_currentWeek);
  const src = `${personId}_${dayIdx}`;
  const tgt = `${targetPersonId}_${targetDayIdx}`;
  if (!d[src] || entryIdx >= d[src].length) return;

  const entry = d[src].splice(entryIdx, 1)[0];
  if (!d[src].length) delete d[src];
  if (!d[tgt]) d[tgt] = [];
  d[tgt].push(entry);

  _renderTable();
  _save();
}

// ── Touch Drag ────────────────────────────────────────────────────────────────

function _initTouchDrag() {
  if (!ROOT) return;
  ROOT.querySelectorAll('[data-drag-person]').forEach(el => {
    const pid = el.dataset.dragPerson;
    const di  = parseInt(el.dataset.dragDay);
    const ei  = parseInt(el.dataset.dragIdx);
    let timer = null, active = false, clone = null, lastTap = 0;

    el.addEventListener('touchstart', (e) => {
      if (e.target.closest('[data-del-person]')) return;
      active = false;
      e.preventDefault();
      timer = setTimeout(() => {
        active = true;
        _dragSrc = { personId: pid, dayIdx: di, entryIdx: ei };
        if (navigator.vibrate) navigator.vibrate(40);
        const rect = el.getBoundingClientRect();
        clone = el.cloneNode(true);
        clone.style.cssText = `position:fixed;z-index:9999;opacity:.85;pointer-events:none;
          width:${rect.width}px;border-radius:10px;box-shadow:var(--shadow-xl);
          left:${rect.left}px;top:${rect.top}px;`;
        document.body.appendChild(clone);
        el.style.opacity = '.25';
      }, 420);
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      if (!active) { clearTimeout(timer); return; }
      e.preventDefault();
      const t = e.touches[0];
      if (clone) { clone.style.left = `${t.clientX-40}px`; clone.style.top = `${t.clientY-20}px`; }
      ROOT.querySelectorAll('.day-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
      if (clone) clone.style.display = 'none';
      const target = document.elementFromPoint(t.clientX, t.clientY);
      if (clone) clone.style.display = '';
      if (target) {
        const cell = target.closest('[data-drop-person]');
        if (cell) cell.classList.add('drag-over');
      }
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
      clearTimeout(timer);
      el.style.opacity = '';
      ROOT.querySelectorAll('.day-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
      if (clone) { clone.remove(); clone = null; }

      if (!active || !_dragSrc) {
        _dragSrc = null; active = false;
        const now = Date.now();
        if (now - lastTap < 350) { lastTap = 0; _openModal(pid, di, ei); }
        else lastTap = now;
        return;
      }
      const t = e.changedTouches[0];
      const target = document.elementFromPoint(t.clientX, t.clientY);
      if (target) {
        const cell = target.closest('[data-drop-person]');
        if (cell) _dropEntry(cell.dataset.dropPerson, parseInt(cell.dataset.dropDay));
      }
      _dragSrc = null; active = false;
    });

    el.addEventListener('touchcancel', () => {
      clearTimeout(timer);
      el.style.opacity = '';
      if (clone) { clone.remove(); clone = null; }
      _dragSrc = null; active = false;
    });
  });
}

// ── Entry Modal ───────────────────────────────────────────────────────────────

let _modalCtx = null;
let _selectedType = null;

function _entryModalHTML() {
  return `
    <div class="modal-backdrop" id="modal-entry" role="dialog" aria-modal="true" aria-labelledby="entry-modal-title" hidden>
      <div class="modal">
        <div class="modal__header">
          <h2 class="modal__title" id="entry-modal-title">Kayıt Ekle</h2>
          <button class="modal__close" id="btn-entry-close" type="button" aria-label="Kapat">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
          </button>
        </div>
        <div class="modal__body">
          <div class="entry-modal-sub" id="entry-modal-sub"></div>

          <!-- Tip seçici -->
          <div class="type-selector">
            <button class="type-opt" data-type="imo"     type="button">IMO'lu</button>
            <button class="type-opt" data-type="imosuz"  type="button">IMO'suz</button>
            <button class="type-opt" data-type="ithalat" type="button">İthalat</button>
            <button class="type-opt" data-type="other"   type="button">Diğer</button>
          </div>

          <div class="form-grid">
            <div class="field">
              <label class="field__label required" for="entry-count">Araç Sayısı</label>
              <input class="field__input field__input--mono" type="text" id="entry-count"
                     placeholder="1" inputmode="numeric" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label" for="entry-desc">Açıklama</label>
              <input class="field__input" type="text" id="entry-desc"
                     placeholder="Kısa açıklama..." autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="entry-firma">Firma</label>
              <input class="field__input" type="text" id="entry-firma"
                     placeholder="Firma adı" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="entry-urun">Ürün</label>
              <input class="field__input" type="text" id="entry-urun"
                     placeholder="Ürün / yük" autocomplete="off"/>
            </div>
          </div>

          <div class="field mt-4">
            <label class="field__label">Yapılacaklar</label>
            <div class="label-chips">
              <button class="label-chip" data-label="ozel"    type="button">🏷️ Özel Etiket</button>
              <button class="label-chip" data-label="lashing" type="button">⛓️ Lashing</button>
              <button class="label-chip" data-label="karton"  type="button">📦 Karton</button>
              <button class="label-chip" data-label="jel"     type="button">💧 Nem Çekici</button>
              <label class="label-chip" id="entry-pin-label" style="cursor:pointer;">
                <input type="checkbox" id="entry-pin" style="position:absolute;clip:rect(0,0,0,0)"/>
                📌 Cut-Off
              </label>
            </div>
          </div>
        </div>
        <div class="modal__footer" id="entry-modal-footer">
          <button class="btn btn--secondary" id="btn-entry-cancel" type="button">İptal</button>
          <button class="btn btn--primary" id="btn-entry-save" type="button">Kaydet</button>
        </div>
      </div>
    </div>
  `;
}

function _openModal(personId, dayIdx, editIdx) {
  const isEdit = editIdx !== undefined && editIdx !== null;
  _modalCtx = { personId, dayIdx, editIdx: isEdit ? editIdx : null };
  _selectedType = null;

  const modal = ROOT.querySelector('#modal-entry');
  if (!modal) return;

  // Başlık
  ROOT.querySelector('#entry-modal-title').textContent = isEdit ? 'Kayıt Düzenle' : 'Kayıt Ekle';
  const person = _persons.find(p => p.id === personId);
  const days   = getWeekDays(_currentWeek);
  ROOT.querySelector('#entry-modal-sub').innerHTML = `
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
    ${_esc(person?.name || '')} &nbsp;·&nbsp;
    ${DAY_NAMES_FULL[dayIdx]}, ${parseDate(days[dayIdx]).toLocaleDateString('tr-TR',{day:'2-digit',month:'long'})}
  `;

  // Sıfırla
  ROOT.querySelector('#entry-count').value = '';
  ROOT.querySelector('#entry-desc').value  = '';
  ROOT.querySelector('#entry-firma').value = '';
  ROOT.querySelector('#entry-urun').value  = '';
  ROOT.querySelector('#entry-pin').checked = false;
  ROOT.querySelector('#entry-pin-label')?.classList.remove('is-checked');
  ROOT.querySelectorAll('.type-opt').forEach(el => el.className = 'type-opt');
  ROOT.querySelectorAll('.label-chip[data-label]').forEach(c => c.classList.remove('is-checked'));

  if (isEdit) {
    const entry = (_dataFor(_currentWeek)[`${personId}_${dayIdx}`] || [])[editIdx];
    if (entry) {
      ROOT.querySelector('#entry-count').value = entry.count || '';
      ROOT.querySelector('#entry-desc').value  = entry.desc  || '';
      ROOT.querySelector('#entry-firma').value = entry.firma || '';
      ROOT.querySelector('#entry-urun').value  = entry.urun  || '';
      ROOT.querySelector('#entry-pin').checked = !!entry.pinned;
      ROOT.querySelector('#entry-pin-label')?.classList.toggle('is-checked', !!entry.pinned);
      _selectedType = entry.type || null;
      if (_selectedType) {
        ROOT.querySelectorAll('.type-opt').forEach(el => {
          if (el.dataset.type === _selectedType) el.classList.add(`sel-${_selectedType}`);
        });
      }
      ROOT.querySelectorAll('.label-chip[data-label]').forEach(c => {
        if (entry.labels?.[c.dataset.label]) c.classList.add('is-checked');
      });

      // Tamamlandı/aktif et footer
      const footer = ROOT.querySelector('#entry-modal-footer');
      if (footer) {
        if (entry.completed) {
          footer.innerHTML = `
            <button class="btn btn--secondary" id="btn-entry-cancel" type="button">İptal</button>
            <button class="btn btn--secondary" id="btn-entry-activate" type="button">↺ Aktif Et</button>
            <button class="btn btn--primary" id="btn-entry-save" type="button">Kaydet</button>
          `;
        } else {
          footer.innerHTML = `
            <button class="btn btn--secondary" id="btn-entry-cancel" type="button">İptal</button>
            <button class="btn btn--ghost" id="btn-entry-complete" type="button" style="color:var(--color-normal)">✓ Tamamlandı</button>
            <button class="btn btn--primary" id="btn-entry-save" type="button">Kaydet</button>
          `;
        }
        _bindModalFooter();
      }
    }
  } else {
    const footer = ROOT.querySelector('#entry-modal-footer');
    if (footer) {
      footer.innerHTML = `
        <button class="btn btn--secondary" id="btn-entry-cancel" type="button">İptal</button>
        <button class="btn btn--primary" id="btn-entry-save" type="button">Kaydet</button>
      `;
      _bindModalFooter();
    }
  }

  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.add('is-open');
    ROOT.querySelector('#entry-count')?.focus();
  });
}

function _closeModal() {
  const modal = ROOT.querySelector('#modal-entry');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.addEventListener('transitionend', () => { modal.hidden = true; }, { once: true });
}

function _saveEntry() {
  const count = ROOT.querySelector('#entry-count')?.value.trim();
  const firma = ROOT.querySelector('#entry-firma')?.value.trim();
  const urun  = ROOT.querySelector('#entry-urun')?.value.trim();

  let valid = true;
  if (!_selectedType) {
    ROOT.querySelectorAll('.type-opt').forEach(el => el.classList.add('type-error'));
    valid = false;
  }
  if (!count) {
    ROOT.querySelector('#entry-count')?.classList.add('has-error');
    if (valid) ROOT.querySelector('#entry-count')?.focus();
    valid = false;
  }
  if (!firma) {
    ROOT.querySelector('#entry-firma')?.classList.add('has-error');
    if (valid) ROOT.querySelector('#entry-firma')?.focus();
    valid = false;
  }
  if (!urun) {
    ROOT.querySelector('#entry-urun')?.classList.add('has-error');
    if (valid) ROOT.querySelector('#entry-urun')?.focus();
    valid = false;
  }
  if (!valid) return;

  const labels = {};
  ROOT.querySelectorAll('.label-chip[data-label]').forEach(c => {
    labels[c.dataset.label] = c.classList.contains('is-checked');
  });

  const entry = {
    count,
    desc:      ROOT.querySelector('#entry-desc')?.value.trim() || '',
    firma,
    urun,
    type:      _selectedType,
    pinned:    ROOT.querySelector('#entry-pin')?.checked || false,
    completed: false,
    labels,
  };

  const d  = _dataFor(_currentWeek);
  const ck = `${_modalCtx.personId}_${_modalCtx.dayIdx}`;
  if (!d[ck]) d[ck] = [];

  if (_modalCtx.editIdx !== null) {
    const prev = d[ck][_modalCtx.editIdx] || {};
    entry.completed = !!prev.completed;
    d[ck][_modalCtx.editIdx] = entry;
  } else {
    d[ck].push(entry);
  }

  _closeModal();
  _renderTable();
  _save();
}

function _toggleComplete() {
  if (!_modalCtx || _modalCtx.editIdx === null) return;
  const d  = _dataFor(_currentWeek);
  const ck = `${_modalCtx.personId}_${_modalCtx.dayIdx}`;
  if (!d[ck]?.[_modalCtx.editIdx]) return;
  d[ck][_modalCtx.editIdx].completed = !d[ck][_modalCtx.editIdx].completed;
  _closeModal();
  _renderTable();
  _save();
}

function _bindModalEvents() {
  if (!ROOT) return;

  ROOT.querySelector('#btn-entry-close')?.addEventListener('click', _closeModal);
  ROOT.querySelector('#modal-entry')?.addEventListener('click', (e) => {
    if (e.target === ROOT.querySelector('#modal-entry')) _closeModal();
  });
  ROOT.querySelector('#modal-entry')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.target.matches('textarea')) _saveEntry();
    if (e.key === 'Escape') _closeModal();
  });

  // Tip seçici
  ROOT.querySelectorAll('.type-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedType = btn.dataset.type;
      ROOT.querySelectorAll('.type-opt').forEach(el => el.className = 'type-opt');
      btn.classList.add(`sel-${_selectedType}`);
    });
  });

  // Label chip toggle
  ROOT.querySelectorAll('.label-chip[data-label]').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('is-checked'));
  });

  // Cut-Off görsel senkronizasyon
  const pinCb = ROOT.querySelector('#entry-pin');
  const pinLabel = ROOT.querySelector('#entry-pin-label');
  if (pinCb && pinLabel) {
    pinCb.addEventListener('change', () => {
      pinLabel.classList.toggle('is-checked', pinCb.checked);
    });
  }

  _bindModalFooter();
  _bindMonthlyEvents();
  _bindAdminEvents();
  _bindSyncEvents();
  _bindConfirmEvents();
}

function _bindModalFooter() {
  ROOT.querySelector('#btn-entry-cancel')?.addEventListener('click', _closeModal);
  ROOT.querySelector('#btn-entry-save')?.addEventListener('click', _saveEntry);
  ROOT.querySelector('#btn-entry-complete')?.addEventListener('click', _toggleComplete);
  ROOT.querySelector('#btn-entry-activate')?.addEventListener('click', _toggleComplete);
}

// ── Chip Tooltip ──────────────────────────────────────────────────────────────

// ── Chip Preview Popup ────────────────────────────────────────────────────────

let _previewEl = null;

const TYPE_LABELS = { imo: 'IMO\'lu', imosuz: 'IMO\'suz', ithalat: 'İthalat', other: 'Diğer' };
const LABEL_NAMES = { ozel: '🏷️ Özel Etiket', lashing: '⛓️ Lashing', karton: '📦 Karton', jel: '💧 Nem Çekici' };

function _openChipPreview(chipEl) {
  _closeChipPreview();
  let data;
  try { data = JSON.parse(chipEl.dataset.preview); } catch { return; }

  const canEdit = !!chipEl.dataset.editPerson;

  const flags = Object.entries(data.labels || {})
    .filter(([, v]) => v)
    .map(([k]) => `<span>${LABEL_NAMES[k] || k}</span>`)
    .join('');

  const pinTag = data.pinned ? '<span>📌 Cut-Off</span>' : '';

  const backdrop = document.createElement('div');
  backdrop.className = 'chip-preview-backdrop';
  backdrop.innerHTML = `
    <div class="chip-preview">
      <button class="chip-preview__close" type="button" aria-label="Kapat">✕</button>
      ${data.type ? `<div class="chip-preview__type">${TYPE_LABELS[data.type] || data.type}</div>` : ''}
      ${data.count ? `<div class="chip-preview__count">${data.count} araç</div>` : ''}
      ${data.firma ? `<div class="chip-preview__firma">${data.firma}</div>` : ''}
      ${data.urun  ? `<div class="chip-preview__urun">${data.urun}</div>` : ''}
      ${data.desc  ? `<div class="chip-preview__desc">${data.desc}</div>` : ''}
      ${(flags || pinTag) ? `<div class="chip-preview__flags">${pinTag}${flags}</div>` : ''}
      ${canEdit ? `<button class="btn btn--secondary btn--sm chip-preview__edit-btn" type="button">Düzenle</button>` : ''}
    </div>
  `;

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.classList.contains('chip-preview__close')) {
      _closeChipPreview();
    }
    if (e.target.classList.contains('chip-preview__edit-btn')) {
      _closeChipPreview();
      _openModal(
        chipEl.dataset.editPerson,
        parseInt(chipEl.dataset.editDay),
        parseInt(chipEl.dataset.editIdx)
      );
    }
  });

  document.addEventListener('keydown', _onPreviewKey);
  document.body.appendChild(backdrop);
  _previewEl = backdrop;
}

function _closeChipPreview() {
  if (_previewEl) {
    _previewEl.remove();
    _previewEl = null;
    document.removeEventListener('keydown', _onPreviewKey);
  }
}

function _onPreviewKey(e) {
  if (e.key === 'Escape') _closeChipPreview();
}

// ── Monthly Modal ─────────────────────────────────────────────────────────────

let _monthlyYear, _monthlyMonth;

function _monthlyModalHTML() {
  return `
    <div class="modal-backdrop" id="modal-monthly" role="dialog" aria-modal="true" aria-labelledby="monthly-title" hidden>
      <div class="modal modal--wide">
        <div class="modal__header">
          <button class="btn btn--ghost btn--icon" id="btn-monthly-prev" type="button" aria-label="Önceki ay">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4l-4 4 4 4"/></svg>
          </button>
          <h2 class="modal__title" id="monthly-title">Aylık Özet</h2>
          <button class="btn btn--ghost btn--icon" id="btn-monthly-next" type="button" aria-label="Sonraki ay">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
          </button>
          <button class="modal__close" id="btn-monthly-close" type="button" aria-label="Kapat">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
          </button>
        </div>
        <div class="modal__body">
          <div id="monthly-table-wrap"></div>
        </div>
      </div>
    </div>
  `;
}

function _openMonthly() {
  const monday = _weekIdToMonday(_currentWeek);
  _monthlyYear  = monday.getFullYear();
  _monthlyMonth = monday.getMonth(); // 0-based

  const modal = document.getElementById('modal-monthly');
  if (!modal) return;

  // Launcher gibi gizli parent içindeyse body'e taşı (position:fixed çalışsın)
  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  _renderMonthlyTable();
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));
}

function _renderMonthlyTable() {
  const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  document.getElementById('monthly-title').textContent = `${MONTH_NAMES[_monthlyMonth]} ${_monthlyYear} — Aylık Özet`;

  const types = ['imo','imosuz','ithalat','other'];
  const typeLabels = ["IMO'lu","IMO'suz","İthalat","Diğer"];
  const totals = {};
  _persons.forEach(p => { totals[p.id] = { imo:0, imosuz:0, ithalat:0, other:0 }; });

  // Tüm haftalardaki verileri tara
  Object.entries(_data).forEach(([wk, wkData]) => {
    const monday = _weekIdToMonday(wk);
    for (let di = 0; di < 7; di++) {
      const dd = new Date(monday);
      dd.setDate(dd.getDate() + di);
      if (dd.getFullYear() === _monthlyYear && dd.getMonth() === _monthlyMonth) {
        _persons.forEach(p => {
          (wkData[`${p.id}_${di}`] || []).forEach(e => {
            if (e.type && totals[p.id]) {
              totals[p.id][e.type] = (totals[p.id][e.type] || 0) + (parseInt(e.count) || 0);
            }
          });
        });
      }
    }
  });

  const grandTotal = { imo:0, imosuz:0, ithalat:0, other:0 };

  const rows = _persons.map(p => {
    const row = totals[p.id] || {};
    const pTotal = types.reduce((s, t) => s + (row[t]||0), 0);
    types.forEach(t => { grandTotal[t] = (grandTotal[t]||0) + (row[t]||0); });
    const cells = types.map(t =>
      `<td class="m-${t} ${row[t] ? '' : 'zero'}">${row[t] || '—'}</td>`
    ).join('');
    return `<tr><td>${_esc(p.name)}</td>${cells}<td>${pTotal || '—'}</td></tr>`;
  }).join('');

  const gTotal = types.reduce((s, t) => s + (grandTotal[t]||0), 0);
  const totalRow = `<tr>
    <td>TOPLAM</td>
    ${types.map(t => `<td class="m-${t}">${grandTotal[t]||'—'}</td>`).join('')}
    <td>${gTotal||'—'}</td>
  </tr>`;

  const headCells = types.map((t,ti) => `<th class="m-${t}">${typeLabels[ti]}</th>`).join('');

  document.getElementById('monthly-table-wrap').innerHTML = `
    <table class="monthly-table">
      <thead><tr><th>KİŞİ</th>${headCells}<th>TOPLAM</th></tr></thead>
      <tbody>${rows}${totalRow}</tbody>
    </table>
  `;
}

function _bindMonthlyEvents() {
  const modal = document.getElementById('modal-monthly');
  document.getElementById('btn-monthly-close')?.addEventListener('click', () => {
    modal?.classList.remove('is-open');
    modal?.addEventListener('transitionend', () => { if (modal) modal.hidden = true; }, { once: true });
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('is-open');
      modal.addEventListener('transitionend', () => { modal.hidden = true; }, { once: true });
    }
  });
  document.getElementById('btn-monthly-prev')?.addEventListener('click', () => {
    _monthlyMonth--;
    if (_monthlyMonth < 0) { _monthlyMonth = 11; _monthlyYear--; }
    _renderMonthlyTable();
  });
  document.getElementById('btn-monthly-next')?.addEventListener('click', () => {
    _monthlyMonth++;
    if (_monthlyMonth > 11) { _monthlyMonth = 0; _monthlyYear++; }
    _renderMonthlyTable();
  });
}

// ── Admin Modal ───────────────────────────────────────────────────────────────

function _adminModalHTML() {
  return `
    <div class="modal-backdrop" id="modal-admin" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title" hidden>
      <div class="modal modal--wide">
        <div class="modal__header">
          <h2 class="modal__title" id="admin-modal-title">Personel Yönetimi</h2>
          <button class="modal__close" id="btn-admin-close" type="button" aria-label="Kapat">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
          </button>
        </div>
        <div class="modal__body">
          <div id="person-list"></div>
          <div class="divider"></div>
          <div style="font-weight:var(--weight-semibold);font-size:var(--text-sm);margin-bottom:var(--space-3);">Yeni Personel Ekle</div>
          <div class="form-grid">
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
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary" id="btn-admin-cancel" type="button">Kapat</button>
          <button class="btn btn--primary" id="btn-admin-add" type="button">Ekle</button>
        </div>
      </div>
    </div>
  `;
}

function _openAdmin() {
  _renderPersonList();
  const modal = ROOT.querySelector('#modal-admin');
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));
}

function _renderPersonList() {
  const list = ROOT.querySelector('#person-list');
  if (!list) return;
  list.innerHTML = _persons.map(p => `
    <div class="person-item" id="pitem-${p.id}">
      <span class="avatar avatar--sm" data-color="${getAvatarColor(p.name)}">${getInitials(p.name)}</span>
      <div class="person-info" id="pinfo-${p.id}">
        <div class="person-name-disp">${_esc(p.name)}</div>
        ${p.role ? `<div class="person-role-disp">${_esc(p.role)}</div>` : ''}
        ${p.mail ? `<div class="person-mail-disp">✉ ${_esc(p.mail)}</div>` : ''}
      </div>
      <div class="person-edit-inputs" id="pedit-${p.id}" hidden style="flex-direction:column;gap:var(--space-1);flex:1;">
        <input class="field__input" type="text" value="${_esc(p.name)}" placeholder="Ad Soyad" id="pename-${p.id}"/>
        <input class="field__input" type="text" value="${_esc(p.role||'')}" placeholder="Ünvan / Rol" id="perole-${p.id}"/>
        <input class="field__input" type="email" value="${_esc(p.mail||'')}" placeholder="mail@akkim.com.tr" id="pemail-${p.id}"/>
      </div>
      <div class="flex gap-2" id="pactions-${p.id}">
        <button class="btn btn--secondary btn--sm" data-edit-person-id="${p.id}" type="button">Düzenle</button>
        <button class="btn btn--danger btn--sm" data-del-person-id="${p.id}" type="button">Sil</button>
      </div>
      <div class="flex gap-2" id="psave-${p.id}" hidden>
        <button class="btn btn--primary btn--sm" data-save-person-id="${p.id}" type="button">Kaydet</button>
        <button class="btn btn--ghost btn--sm" data-cancel-person-id="${p.id}" type="button">İptal</button>
      </div>
    </div>
  `).join('');

  // Bind edit/del/save/cancel
  list.querySelectorAll('[data-edit-person-id]').forEach(btn => {
    btn.addEventListener('click', () => _editPerson(btn.dataset.editPersonId));
  });
  list.querySelectorAll('[data-del-person-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      _showConfirm('Bu personel silinsin mi?', () => {
        _persons = _persons.filter(p => p.id !== btn.dataset.delPersonId);
        _renderPersonList();
        savePersons(JSON.parse(JSON.stringify(_persons)));
      });
    });
  });
  list.querySelectorAll('[data-save-person-id]').forEach(btn => {
    btn.addEventListener('click', () => _savePerson(btn.dataset.savePersonId));
  });
  list.querySelectorAll('[data-cancel-person-id]').forEach(btn => {
    btn.addEventListener('click', () => _cancelEdit(btn.dataset.cancelPersonId));
  });
}

function _editPerson(id) {
  ROOT.querySelector(`#pinfo-${id}`).hidden = true;
  ROOT.querySelector(`#pedit-${id}`).hidden = false;
  ROOT.querySelector(`#pactions-${id}`).hidden = true;
  ROOT.querySelector(`#psave-${id}`).hidden = false;
  ROOT.querySelector(`#pename-${id}`)?.focus();
}

function _cancelEdit(id) {
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
  _renderTable();
  savePersons(JSON.parse(JSON.stringify(_persons)));
}

function _bindAdminEvents() {
  const modal = ROOT?.querySelector('#modal-admin');
  const close = () => {
    modal?.classList.remove('is-open');
    modal?.addEventListener('transitionend', () => {
      if (modal) modal.hidden = true;
      _renderTable();
    }, { once: true });
  };
  ROOT.querySelector('#btn-admin-close')?.addEventListener('click', close);
  ROOT.querySelector('#btn-admin-cancel')?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });

  ROOT.querySelector('#btn-admin-add')?.addEventListener('click', () => {
    const nameEl = ROOT.querySelector('#new-person-name');
    const name   = nameEl?.value.trim();
    if (!name) { nameEl?.classList.add('has-error'); nameEl?.focus(); return; }
    const role = ROOT.querySelector('#new-person-role')?.value.trim() || '';
    const mail = ROOT.querySelector('#new-person-mail')?.value.trim() || '';
    const id   = _genId(name);
    _persons.push({ id, name, role, mail });
    if (nameEl) nameEl.value = '';
    if (ROOT.querySelector('#new-person-role')) ROOT.querySelector('#new-person-role').value = '';
    if (ROOT.querySelector('#new-person-mail')) ROOT.querySelector('#new-person-mail').value = '';
    _renderPersonList();
    savePersons(JSON.parse(JSON.stringify(_persons)));
  });
}

// ── Sync Modal (Randevu → Plan) ───────────────────────────────────────────────

let _syncBooking = null;
let _syncSelectedType = null;

function _syncModalHTML() {
  return `
    <div class="modal-backdrop" id="modal-sync" role="dialog" aria-modal="true" aria-labelledby="sync-modal-title" hidden>
      <div class="modal">
        <div class="modal__header">
          <h2 class="modal__title" id="sync-modal-title">Haftalık Plana Ekle</h2>
          <button class="modal__close" id="btn-sync-close" type="button" aria-label="Kapat">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
          </button>
        </div>
        <div class="modal__body">
          <div class="sync-modal-sub" id="sync-sub"></div>

          <div class="type-selector" id="sync-type-row">
            <button class="type-opt" data-sync-type="imo"     type="button">IMO'lu</button>
            <button class="type-opt" data-sync-type="imosuz"  type="button">IMO'suz</button>
            <button class="type-opt" data-sync-type="ithalat" type="button">İthalat</button>
            <button class="type-opt" data-sync-type="other"   type="button">Diğer</button>
          </div>

          <div class="form-grid">
            <div class="field" id="sync-person-row">
              <label class="field__label" for="sync-person-sel">Personel</label>
              <select class="field__select" id="sync-person-sel"></select>
            </div>
            <div class="field">
              <label class="field__label required" for="sync-count">Araç Sayısı</label>
              <input class="field__input field__input--mono" type="text" id="sync-count" value="1" inputmode="numeric"/>
            </div>
            <div class="field">
              <label class="field__label" for="sync-firma">Firma</label>
              <input class="field__input" type="text" id="sync-firma" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label" for="sync-urun">Ürün</label>
              <input class="field__input" type="text" id="sync-urun" autocomplete="off"/>
            </div>
            <div class="field field--full">
              <label class="field__label" for="sync-desc">Not</label>
              <input class="field__input" type="text" id="sync-desc" autocomplete="off"/>
            </div>
          </div>

          <div class="field mt-4">
            <div class="label-chips">
              <button class="label-chip" data-sync-label="ozel"    type="button">🏷️ Özel Etiket</button>
              <button class="label-chip" data-sync-label="lashing" type="button">⛓️ Lashing</button>
              <button class="label-chip" data-sync-label="karton"  type="button">📦 Karton</button>
              <button class="label-chip" data-sync-label="jel"     type="button">💧 Nem Çekici</button>
              <label class="label-chip" style="cursor:pointer;">
                <input type="checkbox" id="sync-pin" style="position:absolute;clip:rect(0,0,0,0)"/>
                📌 Cut-Off
              </label>
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary" id="btn-sync-cancel" type="button">İptal</button>
          <button class="btn btn--primary" id="btn-sync-confirm" type="button">Plana Ekle</button>
        </div>
      </div>
    </div>
  `;
}

export function showSyncToast(plate, company, cargo, dateKey) {
  _syncBooking = { plate, company, cargo, dateKey };
  _syncSelectedType = null;

  ROOT.querySelector('#sync-sub').textContent = `${company || plate || ''} — ${dateKey}`;
  ROOT.querySelector('#sync-count').value = '1';
  ROOT.querySelector('#sync-firma').value = company || '';
  ROOT.querySelector('#sync-urun').value  = cargo   || '';
  ROOT.querySelector('#sync-desc').value  = '';
  const pinEl = ROOT.querySelector('#sync-pin'); if (pinEl) pinEl.checked = false;
  ROOT.querySelectorAll('.label-chip[data-sync-label]').forEach(c => c.classList.remove('is-checked'));
  ROOT.querySelectorAll('[data-sync-type]').forEach(el => el.className = 'type-opt');

  const user = getActiveUser();
  const isAdmin = _isAdmin();
  const personRow = ROOT.querySelector('#sync-person-row');
  if (isAdmin && personRow) {
    personRow.hidden = false;
    const sel = ROOT.querySelector('#sync-person-sel');
    if (sel) {
      sel.innerHTML = _persons.map(p =>
        `<option value="${p.id}">${_esc(p.name)}</option>`
      ).join('');
      // Aktif kullanıcıyı seç
      if (user) sel.value = user.id;
    }
  } else if (personRow) {
    personRow.hidden = true;
  }

  const modal = ROOT.querySelector('#modal-sync');
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));
}

function _syncDismiss() {
  const modal = ROOT.querySelector('#modal-sync');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.addEventListener('transitionend', () => { modal.hidden = true; }, { once: true });
  _syncBooking = null; _syncSelectedType = null;
}

async function _syncConfirm() {
  if (!_syncBooking) return;
  if (!_syncSelectedType) {
    ROOT.querySelectorAll('[data-sync-type]').forEach(el => el.classList.add('type-error'));
    return;
  }

  const user = getActiveUser();
  const isAdmin = _isAdmin();
  const personId = isAdmin
    ? (ROOT.querySelector('#sync-person-sel')?.value || user?.id)
    : user?.id;
  if (!personId) { _syncDismiss(); return; }

  const [y, m, d] = _syncBooking.dateKey.split('-');
  const bDate  = new Date(+y, +m-1, +d);
  const monday = _getMonday(bDate);
  const wk     = getWeekId(monday);
  const dayIdx = (bDate.getDay() + 6) % 7;

  // Hedef hafta bellekte yoksa önce Firestore'dan yükle
  if (!_data[wk]) {
    const fresh = await loadWeeklyData(wk);
    _data[wk] = fresh || {};
  }

  const d2 = _dataFor(wk);
  const ck = `${personId}_${dayIdx}`;
  if (!d2[ck]) d2[ck] = [];

  const labels = {};
  ROOT.querySelectorAll('.label-chip[data-sync-label]').forEach(c => {
    labels[c.dataset.syncLabel] = c.classList.contains('is-checked');
  });

  d2[ck].push({
    count:     ROOT.querySelector('#sync-count')?.value || '1',
    firma:     ROOT.querySelector('#sync-firma')?.value.trim() || _syncBooking.company || '',
    urun:      ROOT.querySelector('#sync-urun')?.value.trim()  || _syncBooking.cargo   || '',
    desc:      ROOT.querySelector('#sync-desc')?.value.trim()  || '',
    pinned:    ROOT.querySelector('#sync-pin')?.checked || false,
    type:      _syncSelectedType,
    completed: false,
    labels,
  });

  saveWeeklyWeek(wk, JSON.parse(JSON.stringify(d2)));

  // Mevcut hafta gösteriliyorsa güncelle
  if (wk === _currentWeek) _renderTable();

  _syncDismiss();

  if (window.App?.showToast) {
    const person = _persons.find(p => p.id === personId);
    window.App.showToast({
      title: `${person?.name || ''} — haftalık plana eklendi`,
      type:  'success',
    });
  }
}

function _bindSyncEvents() {
  ROOT.querySelector('#btn-sync-close')?.addEventListener('click', _syncDismiss);
  ROOT.querySelector('#btn-sync-cancel')?.addEventListener('click', _syncDismiss);
  ROOT.querySelector('#btn-sync-confirm')?.addEventListener('click', _syncConfirm);
  ROOT.querySelector('#modal-sync')?.addEventListener('click', (e) => {
    if (e.target === ROOT.querySelector('#modal-sync')) _syncDismiss();
  });
  ROOT.querySelectorAll('[data-sync-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      _syncSelectedType = btn.dataset.syncType;
      ROOT.querySelectorAll('[data-sync-type]').forEach(el => el.className = 'type-opt');
      btn.classList.add(`sel-${_syncSelectedType}`);
    });
  });
  ROOT.querySelectorAll('.label-chip[data-sync-label]').forEach(c => {
    c.addEventListener('click', () => c.classList.toggle('is-checked'));
  });
}

// ── Confirm ───────────────────────────────────────────────────────────────────

let _confirmCallback = null;

function _confirmHTML() {
  return `
    <div class="modal-backdrop confirm-dialog" id="modal-hconfirm" role="alertdialog" aria-modal="true" hidden>
      <div class="modal modal--narrow">
        <div class="modal__header">
          <h2 class="modal__title" id="hconfirm-msg">Emin misiniz?</h2>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary" id="btn-hconfirm-no" type="button">İptal</button>
          <button class="btn btn--danger" id="btn-hconfirm-yes" type="button">Evet</button>
        </div>
      </div>
    </div>
  `;
}

function _showConfirm(msg, cb) {
  ROOT.querySelector('#hconfirm-msg').textContent = msg;
  _confirmCallback = cb;
  const modal = ROOT.querySelector('#modal-hconfirm');
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));
}

function _bindConfirmEvents() {
  ROOT.querySelector('#btn-hconfirm-no')?.addEventListener('click', () => {
    ROOT.querySelector('#modal-hconfirm')?.classList.remove('is-open');
    ROOT.querySelector('#modal-hconfirm').hidden = true;
    _confirmCallback = null;
  });
  ROOT.querySelector('#btn-hconfirm-yes')?.addEventListener('click', () => {
    ROOT.querySelector('#modal-hconfirm')?.classList.remove('is-open');
    ROOT.querySelector('#modal-hconfirm').hidden = true;
    if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _dataFor(weekId) {
  if (!_data[weekId]) _data[weekId] = {};
  return _data[weekId];
}

function _canEdit() {
  const user = getActiveUser();
  if (!user) return false;
  if (user.role === 'guest') return false;
  return true;
}

function _isAdmin() {
  return getIsAdminSession();
}

function _activeUser() {
  return getActiveUser();
}

function _save() {
  _saving = true;
  saveWeeklyWeek(_currentWeek, JSON.parse(JSON.stringify(_dataFor(_currentWeek))))
    .then(() => { _saving = false; })
    .catch(() => { _saving = false; });
}

function _getMonday(d) {
  const dt = new Date(d); dt.setHours(0,0,0,0);
  const day = dt.getDay();
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
  return dt;
}

function _weekIdToMonday(weekId) {
  const [yearStr, wStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(wStr, 10);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - jan4Day + 1 + (week - 1) * 7);
  return monday;
}

function _genId(name) {
  return name.toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]/g,'') + '_' + Date.now().toString(36);
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Global API (window.H) ─────────────────────────────────────────────────────

window.H = {
  init,
  render:       _renderTable,
  showSyncToast,
  goToWeek: (dateStr) => {
    if (!dateStr) return;
    const [y,m,d] = dateStr.split('-');
    _currentWeek = getWeekId(new Date(+y, +m-1, +d));
    setLastWeek(_currentWeek);
    _watchWeek(_currentWeek);
    _renderTable();
  },
  getDataForDate: (dateStr) => {
    const [y,m,d] = dateStr.split('-');
    const bDate  = new Date(+y, +m-1, +d);
    const wk     = getWeekId(bDate);
    const dayIdx = (bDate.getDay() + 6) % 7;
    const weekData = _dataFor(wk);
    const user = getActiveUser();
    const canSeeAll = _isAdmin() || user?.role === 'wms' || user?.role === 'wms_operator';
    const persons = canSeeAll ? _persons : _persons.filter(p => p.id === user?.id);
    return persons.flatMap(p =>
      (weekData[`${p.id}_${dayIdx}`] || []).map(e =>
        Object.assign({}, e, { personId: p.id, personName: p.name })
      )
    );
  },
  _rtUpdate: (freshData) => {
    const currentWk = _currentWeek;
    Object.keys(freshData).forEach(wk => {
      if (wk !== currentWk) _data[wk] = freshData[wk];
    });
    const modal = ROOT?.querySelector('#modal-entry');
    if (!modal?.classList.contains('is-open')) {
      if (freshData[currentWk]) _data[currentWk] = freshData[currentWk];
      _renderTable();
    }
  },
};
