/**
 * Randevu Modülü — window.R
 *
 * Takvim görünümü, slot timeline, randevu ekleme/düzenleme/silme, drag-drop.
 */

import { ADR_SLOTS, NORMAL_SLOTS, toTime, isSlotPast } from './slots.js';
import { watchBookings, saveBookingDate,
         loadBookingDate }                              from '../../core/storage.js';
import { emit, on }                                     from '../../core/events.js';
import { getIsAdminSession, getActiveUser }             from '../../core/auth.js';
import { isHoliday, getHolidayName }                   from '../../utils/holidays.js';
import { formatDateDisplay, formatDateLong, formatDateKey,
         parseDate, getWeekId, todayKey,
         prevMonth, nextMonth, getMonthDays,
         getMonthName }                                 from '../../utils/date.js';
import { parsePasteText }                               from '../../utils/parser.js';
import { setLastRandevuDate, getLastRandevuDate }       from '../../utils/storage-local.js';

// ── State ────────────────────────────────────────────────────────────────────

let _allBookings = {};
let _selectedDate = null;
let _currentYear, _currentMonth;
let _view = 'home';   // 'home' | 'schedule'
let _modalCtx = { type: null, idx: null, editMode: false };
let _dragSrc = null;
let _unsubWatch = null;

const ROOT = document.getElementById('view-randevu');

// ── Init ─────────────────────────────────────────────────────────────────────

export function init() {
  const today = new Date();
  _currentYear  = today.getFullYear();
  _currentMonth = today.getMonth() + 1;

  // Önceki seçili tarihi geri yükle
  const lastDate = getLastRandevuDate();
  _selectedDate = lastDate || null;

  _render();

  // Auth değişince butonları güncelle
  on('auth:changed', () => {
    if (_view === 'schedule') _renderSchedule();
  });
  on('user:changed', () => {
    if (_view === 'schedule') _renderSchedule();
  });
}

// ── Top-level Render ─────────────────────────────────────────────────────────

function _render() {
  if (!ROOT) return;
  ROOT.innerHTML = `<div class="randevu-page" id="randevu-inner"></div>`;
  if (_view === 'home') {
    _renderHome();
  } else {
    _renderSchedule();
  }
  _bindModalEvents();
}

// ── HOME VIEW ────────────────────────────────────────────────────────────────

function _renderHome() {
  const inner = document.getElementById('randevu-inner');
  const dateStr = _selectedDate;
  const bk = dateStr ? _bookingsFor(dateStr) : null;
  const aCount = bk ? Object.keys(bk.adr||{}).length : 0;
  const nCount = bk ? Object.keys(bk.normal||{}).length : 0;

  const holidays = _getMonthHolidays(_currentYear, _currentMonth);

  inner.innerHTML = `
    <div class="randevu-home animate-fade-in">

      <!-- Takvim -->
      <div>
        ${_calendarHTML()}
      </div>

      <!-- Sidebar -->
      <div class="randevu-sidebar">
        <div class="randevu-sidebar__date">
          ${dateStr
            ? `<span class="toolbar-week-badge">${parseInt(getWeekId(parseDate(dateStr)).split('-W')[1], 10)}</span>${formatDateDisplay(dateStr)}<span>${formatDateLong(dateStr)}</span>`
            : `<span>Bir tarih seçin</span>`
          }
        </div>

        <div class="randevu-stats stagger">
          <div class="stat-card">
            <div class="stat-card__label">Toplam</div>
            <div class="stat-card__value" id="stat-total">${aCount + nCount}</div>
          </div>
          <div class="stat-card stat-card--imo">
            <div class="stat-card__label">IMO'lu</div>
            <div class="stat-card__value" id="stat-adr">${aCount}</div>
          </div>
          <div class="stat-card stat-card--normal">
            <div class="stat-card__label">IMO'suz</div>
            <div class="stat-card__value" id="stat-normal">${nCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">Boş Slot</div>
            <div class="stat-card__value">${(ADR_SLOTS.length - aCount) + (NORMAL_SLOTS.length - nCount)}</div>
          </div>
        </div>

        <button class="btn btn--primary btn--lg randevu-open-btn"
                id="btn-open-schedule" type="button"
                ${!dateStr ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
            <rect x="2" y="2" width="12" height="12" rx="2"/>
            <path d="M5 8h6M8 5v6"/>
          </svg>
          Randevu Listesi
        </button>

        ${dateStr && getHolidayName(dateStr) ? `
          <div class="chip chip--status" style="gap:var(--space-2)">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5L10 10"/></svg>
            ${_esc(getHolidayName(dateStr))}
          </div>
        ` : ''}
      </div>

    </div>

    ${_modalHTML()}
    ${_confirmHTML()}
  `;

  _bindCalendarEvents();
  _bindHomeEvents();
}

function _calendarHTML() {
  const year  = _currentYear;
  const month = _currentMonth;
  const days  = getMonthDays(year, month);
  const todayStr = todayKey();

  // Haftanın ilk günü Pazartesi
  const firstDate = parseDate(days[0]);
  let startDow = firstDate.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // 0=Mon

  const DAY_NAMES = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
  const dayLabels = `<div class="calendar__day-label calendar__day-label--wk">H</div>` +
    DAY_NAMES.map(d => `<div class="calendar__day-label">${d}</div>`).join('');

  // Tüm slot'ları düz dizi: boşluklar null, günler dateStr
  const allSlots = [...Array(startDow).fill(null), ...days];
  while (allSlots.length % 7 !== 0) allSlots.push(null);

  // 7'li satırlar → hafta sütunu başına eklenir
  const rows = [];
  for (let i = 0; i < allSlots.length; i += 7) rows.push(allSlots.slice(i, i + 7));

  const cells = rows.flatMap(row => {
    const firstSlot = row.find(c => c !== null);
    const wNum = firstSlot ? parseInt(getWeekId(parseDate(firstSlot)).split('-W')[1], 10) : '';
    const wkCell = `<div class="calendar__week-num">${wNum}</div>`;

    const dayCells = row.map(dateStr => {
      if (!dateStr) return `<div class="calendar__day is-outside"></div>`;
      const d = parseDate(dateStr);
      const holiday  = isHoliday(dateStr);
      const hName    = getHolidayName(dateStr);
      const bk = _allBookings[dateStr];
      const hasAdr  = bk && Object.keys(bk.adr||{}).length > 0;
      const hasNorm = bk && Object.keys(bk.normal||{}).length > 0;

      let cls = 'calendar__day';
      if (holiday) cls += ' is-disabled';
      if (dateStr === todayStr) cls += ' is-today';
      if (dateStr === _selectedDate) cls += ' is-selected';

      const dots = (hasAdr || hasNorm) ? `
        <div class="calendar__dots">
          ${hasAdr  ? `<span class="calendar__dot imo"></span>` : ''}
          ${hasNorm ? `<span class="calendar__dot imosuz"></span>` : ''}
        </div>` : '';

      const title = hName ? ` title="${_esc(hName)}"` : '';

      return `
        <button class="calendar__day" data-date="${dateStr}"${title}
                ${holiday ? 'disabled' : ''} type="button" aria-label="${dateStr}">
          <span class="calendar__day-num">${d.getDate()}</span>
          ${dots}
        </button>
      `;
    });

    return [wkCell, ...dayCells];
  });

  return `
    <div class="calendar">
      <div class="calendar__header">
        <button class="btn btn--ghost btn--icon" id="cal-prev" type="button" aria-label="Önceki ay">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4l-4 4 4 4"/></svg>
        </button>
        <div class="calendar__month-title">${getMonthName(month)} ${year}</div>
        <button class="btn btn--ghost btn--icon" id="cal-next" type="button" aria-label="Sonraki ay">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
        </button>
      </div>
      <div class="calendar__days-header">${dayLabels}</div>
      <div class="calendar__grid">${cells.join('')}</div>
    </div>
  `;
}

function _bindCalendarEvents() {
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    const { year, month } = prevMonth(_currentYear, _currentMonth);
    _currentYear = year; _currentMonth = month;
    _renderHome();
  });

  document.getElementById('cal-next')?.addEventListener('click', () => {
    const { year, month } = nextMonth(_currentYear, _currentMonth);
    _currentYear = year; _currentMonth = month;
    _renderHome();
  });

  ROOT.querySelectorAll('.calendar__day[data-date]').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedDate = btn.dataset.date;
      setLastRandevuDate(_selectedDate);
      _watchDate(_selectedDate);
      _renderHome();
    });

    btn.addEventListener('dblclick', () => {
      _selectedDate = btn.dataset.date;
      setLastRandevuDate(_selectedDate);
      _watchDate(_selectedDate);
      _view = 'schedule';
      _render();
    });
  });
}

function _bindHomeEvents() {
  document.getElementById('btn-open-schedule')?.addEventListener('click', () => {
    if (!_selectedDate) return;
    _watchDate(_selectedDate);
    _view = 'schedule';
    _render();
  });
}

// ── SCHEDULE VIEW ────────────────────────────────────────────────────────────

function _renderSchedule() {
  if (!ROOT) return;
  const inner = document.getElementById('randevu-inner') || ROOT;

  const bk   = _bookingsFor(_selectedDate);
  const aCount = Object.keys(bk.adr).length;
  const nCount = Object.keys(bk.normal).length;
  const canEdit = _canEdit();
  const holidayName = getHolidayName(_selectedDate);

  inner.innerHTML = `
    <div class="schedule-view animate-fade-in">

      <div class="schedule-header">
        <button class="btn btn--ghost btn--sm" id="btn-back-home" type="button" aria-label="Takvime dön">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4l-4 4 4 4"/></svg>
          Takvim
        </button>

        <div class="schedule-header__date">${formatDateDisplay(_selectedDate)}</div>

        ${holidayName
          ? `<span class="chip chip--status" style="font-size:var(--text-xs);">${_esc(holidayName)}</span>`
          : ''
        }

        <div class="schedule-header__spacer"></div>

        <div class="schedule-header__chips">
          <span class="chip chip--status confirmed">IMO'lu: ${aCount}/${ADR_SLOTS.length}</span>
          <span class="chip chip--status processed">IMO'suz: ${nCount}/${NORMAL_SLOTS.length}</span>
          <span class="chip chip--status" style="background:var(--gray-100);color:var(--gray-600);">
            Toplam: ${aCount + nCount}
          </span>
        </div>
      </div>

      <div class="schedule-content">

        <!-- ADR Rampası -->
        <div class="ramp-section">
          <div class="ramp-header adr">
            <span class="ramp-title">Rampa 1 — IMO'lu</span>
            <span class="ramp-count">${aCount}/${ADR_SLOTS.length}</span>
            ${canEdit ? `
              <button class="btn btn--ghost btn--sm" id="btn-clear-adr" type="button" title="Rampayı temizle">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
              </button>` : ''}
          </div>
          <div id="timeline-adr">
            ${_slotsHTML('adr')}
          </div>
        </div>

        <!-- Normal Rampası -->
        <div class="ramp-section">
          <div class="ramp-header normal">
            <span class="ramp-title">Rampa 2 — IMO'suz</span>
            <span class="ramp-count">${nCount}/${NORMAL_SLOTS.length}</span>
            ${canEdit ? `
              <button class="btn btn--ghost btn--sm" id="btn-clear-normal" type="button" title="Rampayı temizle">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
              </button>` : ''}
          </div>
          <div id="timeline-normal">
            ${_slotsHTML('normal')}
          </div>
        </div>

      </div>
    </div>

    ${_modalHTML()}
    ${_confirmHTML()}
  `;

  _bindScheduleEvents();
  _bindModalEvents();
  _initTouchDrag();
}

function _slotsHTML(type) {
  const slots = type === 'adr' ? ADR_SLOTS : NORMAL_SLOTS;
  const bk    = _bookingsFor(_selectedDate)[type];
  const canEdit = _canEdit();

  return slots.map((slot, idx) => {
    const booking = bk[idx];
    const past    = isSlotPast(_selectedDate, slot.end);
    const timeCol = `
      <div class="slot-time">
        <span class="slot-time__start">${toTime(slot.start)}</span>
        <span class="slot-time__sep">↓</span>
        <span class="slot-time__end">${toTime(slot.end % 1440 === 0 ? 1440 : slot.end)}</span>
      </div>
    `;

    if (booking) {
      const user = getActiveUser();
      const isOwner = user && booking.createdBy && booking.createdBy === user.name;
      const canDel  = canEdit || isOwner;

      const cutoffTag = booking.cutoff ? `<span class="tag tag--neutral">📌 Cut-Off</span>` : '';
      const imoTag = `<span class="tag tag--${type === 'adr' ? 'imo' : 'imosuz'}">${type === 'adr' ? "IMO'lu" : "IMO'suz"}</span>`;
      const inlineMeta = [
        booking.konteyner ? `<span class="booking-detail-inline">📦 <strong>${_esc(booking.konteyner)}</strong></span>` : '',
        booking.dorse     ? `<span class="booking-detail-inline">🚛 <strong>${_esc(booking.dorse)}</strong></span>` : '',
        booking.sofor     ? `<span class="booking-detail-inline">👤 <strong>${_esc(booking.sofor)}</strong></span>` : '',
      ].filter(Boolean).join('');

      const meta = [
        booking.company ? `<span class="booking-meta-item">${_esc(booking.company)}</span>` : '',
        booking.cargo   ? `<span class="booking-meta-item">📦 ${_esc(booking.cargo)}</span>` : '',
        booking.miktar  ? `<span class="booking-meta-item">⚖️ ${_esc(booking.miktar)}</span>` : '',
      ].filter(Boolean).join('');

      const flagIcons = [
        booking.labels?.lashing ? `<span title="Lashing">⛓️</span>` : '',
        booking.labels?.jel     ? `<span title="Nem Çekici">💧</span>` : '',
        booking.labels?.karton  ? `<span title="Karton">📦</span>` : '',
        booking.labels?.ozel    ? `<span title="Özel Etiket">🏷️</span>` : '',
      ].filter(Boolean).join('');

      const dragAttr = canDel
        ? `draggable="true" data-drag-src="${type}:${idx}"`
        : '';

      return `
        <div class="slot-card slot-card--booked slot-card--${type} ${past ? 'is-past' : ''}"
             data-slot-type="${type}" data-slot-idx="${idx}" ${dragAttr}>
          ${timeCol}
          <div class="slot-body">
            <div class="booking-title-row">
              ${cutoffTag}${imoTag}
              <span class="booking-plaka">${_esc(booking.plate)}</span>
              ${inlineMeta}
            </div>
            ${meta ? `<div class="booking-meta">${meta}</div>` : ''}
            ${flagIcons ? `<div class="booking-flags">${flagIcons}</div>` : ''}
            ${booking.not ? `<div class="booking-creator" style="color:var(--color-muted)">${_esc(booking.not)}</div>` : ''}
            ${booking.createdBy ? `<div class="booking-creator">↳ ${_esc(booking.createdBy)}</div>` : ''}
          </div>
          ${canDel ? `
            <div class="slot-actions">
              <button class="btn btn--ghost btn--icon btn--sm slot-drag-handle" data-drag-type="${type}" data-drag-idx="${idx}" type="button" aria-label="Taşı" title="Sürükle">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity=".5"><circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/></svg>
              </button>
              <button class="btn btn--ghost btn--icon btn--sm" data-edit-type="${type}" data-edit-idx="${idx}" type="button" aria-label="Düzenle" title="Düzenle">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>
              </button>
              <button class="btn btn--ghost btn--icon btn--sm" data-del-type="${type}" data-del-idx="${idx}" type="button" aria-label="Sil" title="Sil" style="color:var(--color-danger)">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 4L4 12M4 4l8 8"/></svg>
              </button>
            </div>` : ''}
        </div>
      `;
    } else {
      if (!canEdit) {
        return `
          <div class="slot-card slot-card--empty is-readonly ${past ? 'is-past' : ''}">
            ${timeCol}
            <div class="slot-body">
              <span class="slot-empty-hint">Boş</span>
            </div>
          </div>
        `;
      }
      return `
        <div class="slot-card slot-card--empty ${past ? 'is-past' : ''}"
             data-drop-type="${type}" data-drop-idx="${idx}"
             data-add-type="${type}" data-add-idx="${idx}">
          ${timeCol}
          <div class="slot-body">
            <span class="slot-empty-hint">
              <span class="slot-add-icon">+</span>
              Boş slot — eklemek için tıklayın
            </span>
          </div>
        </div>
      `;
    }
  }).join('');
}

function _bindScheduleEvents() {
  // Geri butonu
  document.getElementById('btn-back-home')?.addEventListener('click', () => {
    _view = 'home';
    _render();
  });

  // Rampa temizle
  document.getElementById('btn-clear-adr')?.addEventListener('click', () => {
    _showConfirm('Rampa 1 tüm randevuları silinsin mi?', () => {
      _bookingsFor(_selectedDate).adr = {};
      _saveAndRefreshSchedule();
    });
  });

  document.getElementById('btn-clear-normal')?.addEventListener('click', () => {
    _showConfirm('Rampa 2 tüm randevuları silinsin mi?', () => {
      _bookingsFor(_selectedDate).normal = {};
      _saveAndRefreshSchedule();
    });
  });

  // Boş slot tıklama → modal aç
  ROOT.querySelectorAll('[data-add-type]').forEach(el => {
    el.addEventListener('click', () => {
      const type = el.dataset.addType;
      const idx  = parseInt(el.dataset.addIdx);
      _openModal(type, idx, false);
    });
  });

  // Düzenle butonu
  ROOT.querySelectorAll('[data-edit-type]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.editType;
      const idx  = parseInt(btn.dataset.editIdx);
      _openModal(type, idx, true);
    });
  });

  // Sil butonu
  ROOT.querySelectorAll('[data-del-type]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.delType;
      const idx  = parseInt(btn.dataset.delIdx);
      const bk = _bookingsFor(_selectedDate)[type][idx];
      _showConfirm(`${bk?.plate || 'Bu randevu'} silinsin mi?`, () => {
        delete _bookingsFor(_selectedDate)[type][idx];
        _saveAndRefreshSchedule();
      });
    });
  });

  // Desktop drag-drop
  ROOT.querySelectorAll('[data-drag-src]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const [type, idx] = el.dataset.dragSrc.split(':');
      _dragSrc = { type, idx: parseInt(idx) };
      el.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('is-dragging');
    });
  });

  ROOT.querySelectorAll('[data-drop-type]').forEach(el => {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!_dragSrc) return;
      const targetType = el.dataset.dropType;
      const targetIdx  = parseInt(el.dataset.dropIdx);
      _dropSlot(targetType, targetIdx);
    });
  });
}

function _dropSlot(targetType, targetIdx) {
  if (!_dragSrc) return;
  const { type: srcType, idx: srcIdx } = _dragSrc;
  _dragSrc = null;
  if (srcType === targetType && srcIdx === targetIdx) return;

  const bk = _bookingsFor(_selectedDate);
  if (!bk[srcType][srcIdx] || bk[targetType][targetIdx]) return;

  bk[targetType][targetIdx] = bk[srcType][srcIdx];
  delete bk[srcType][srcIdx];
  _saveAndRefreshSchedule();
}

// ── Touch Drag ────────────────────────────────────────────────────────────────

function _initTouchDrag() {
  ROOT.querySelectorAll('[data-drag-src]').forEach(card => {
    const [type, idxStr] = card.dataset.dragSrc.split(':');
    const idx = parseInt(idxStr);
    let timer = null, active = false, clone = null, lastTap = 0;

    card.addEventListener('touchstart', (e) => {
      if (e.target.closest('[data-del-type],[data-edit-type]')) return;
      active = false;
      e.preventDefault();
      timer = setTimeout(() => {
        active = true;
        _dragSrc = { type, idx };
        if (navigator.vibrate) navigator.vibrate(40);
        const rect = card.getBoundingClientRect();
        clone = card.cloneNode(true);
        clone.style.cssText = `position:fixed;z-index:9999;opacity:.85;pointer-events:none;
          width:${rect.width}px;border-radius:12px;box-shadow:var(--shadow-xl);
          left:${rect.left}px;top:${rect.top}px;`;
        document.body.appendChild(clone);
        card.style.opacity = '.25';
      }, 420);
    }, { passive: false });

    card.addEventListener('touchmove', (e) => {
      if (!active) { clearTimeout(timer); return; }
      e.preventDefault();
      const t = e.touches[0];
      if (clone) { clone.style.left = `${t.clientX - 40}px`; clone.style.top = `${t.clientY - 30}px`; }
      ROOT.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (clone) clone.style.display = 'none';
      const target = document.elementFromPoint(t.clientX, t.clientY);
      if (clone) clone.style.display = '';
      if (target) {
        const slot = target.closest('[data-drop-type]');
        if (slot) slot.classList.add('drag-over');
      }
    }, { passive: false });

    card.addEventListener('touchend', (e) => {
      clearTimeout(timer);
      card.style.opacity = '';
      ROOT.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (clone) { clone.remove(); clone = null; }

      if (!active || !_dragSrc) {
        _dragSrc = null; active = false;
        const now = Date.now();
        if (now - lastTap < 350) {
          lastTap = 0;
          _openModal(type, idx, true);
        } else { lastTap = now; }
        return;
      }
      const t = e.changedTouches[0];
      const target = document.elementFromPoint(t.clientX, t.clientY);
      if (target) {
        const slot = target.closest('[data-drop-type]');
        if (slot) _dropSlot(slot.dataset.dropType, parseInt(slot.dataset.dropIdx));
      }
      _dragSrc = null; active = false;
    });

    card.addEventListener('touchcancel', () => {
      clearTimeout(timer);
      card.style.opacity = '';
      if (clone) { clone.remove(); clone = null; }
      _dragSrc = null; active = false;
    });
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function _modalHTML() {
  return `
    <div class="modal-backdrop" id="modal-booking" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title" hidden>
      <div class="modal modal--wide">
        <div class="modal__header">
          <h2 class="modal__title" id="booking-modal-title">Randevu Ekle</h2>
          <div id="booking-modal-badge"></div>
          <button class="modal__close" id="btn-booking-close" type="button" aria-label="Kapat">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
          </button>
        </div>
        <div class="modal__body">
          <div class="booking-modal-slot" id="booking-slot-info"></div>

          <!-- Paste satırı -->
          <div class="booking-paste-row">
            <div class="field">
              <label class="field__label" for="field-paste">Hızlı Yapıştır</label>
              <input class="field__input" type="text" id="field-paste"
                     placeholder="Plaka / konteyner / treyler / sürücü yapıştırın..." autocomplete="off"/>
            </div>
            <button class="btn btn--secondary" id="btn-parse" type="button">Ayrıştır</button>
          </div>

          <div class="form-grid">
            <div class="field">
              <label class="field__label required" for="field-plate">Plaka</label>
              <input class="field__input field__input--mono" type="text" id="field-plate"
                     placeholder="34 ABC 1234" autocomplete="off" maxlength="12"/>
            </div>
            <div class="field">
              <label class="field__label required" for="field-company">Firma</label>
              <input class="field__input" type="text" id="field-company"
                     placeholder="Firma adı" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="field-konteyner">Konteyner No</label>
              <input class="field__input field__input--mono" type="text" id="field-konteyner"
                     placeholder="PETU 123456-7" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="field-dorse">Treyler Plakası</label>
              <input class="field__input field__input--mono" type="text" id="field-dorse"
                     placeholder="34 TT 9901" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="field-sofor">Sürücü Adı</label>
              <input class="field__input" type="text" id="field-sofor"
                     placeholder="Ad Soyad" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="field-cargo">Yük / Ürün</label>
              <input class="field__input" type="text" id="field-cargo"
                     placeholder="Ürün adı" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label required" for="field-miktar">Miktar</label>
              <input class="field__input" type="text" id="field-miktar"
                     placeholder="Ton / adet" autocomplete="off"/>
            </div>
            <div class="field">
              <label class="field__label" for="field-not">Not</label>
              <input class="field__input" type="text" id="field-not"
                     placeholder="Ekstra not..." autocomplete="off"/>
            </div>
          </div>

          <!-- Yapılacaklar -->
          <div class="field mt-4">
            <span class="field__label">Yapılacaklar</span>
            <div class="label-chips">
              <button class="label-chip" data-label="ozel" type="button">🏷️ Özel Etiket</button>
              <button class="label-chip" data-label="lashing" type="button">⛓️ Lashing</button>
              <button class="label-chip" data-label="karton" type="button">📦 Karton</button>
              <button class="label-chip" data-label="jel" type="button">💧 Nem Çekici</button>
              <label class="label-chip" style="cursor:pointer;">
                <input type="checkbox" id="field-cutoff" style="position:absolute;clip:rect(0,0,0,0)" />
                📌 Cut-Off
              </label>
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary" id="btn-booking-cancel" type="button">İptal</button>
          <button class="btn btn--primary" id="btn-booking-save" type="button">Kaydet</button>
        </div>
      </div>
    </div>
  `;
}

function _confirmHTML() {
  return `
    <div class="modal-backdrop confirm-dialog" id="modal-confirm" role="alertdialog" aria-modal="true" hidden>
      <div class="modal modal--narrow">
        <div class="modal__header">
          <h2 class="modal__title" id="confirm-message">Emin misiniz?</h2>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary" id="btn-confirm-no" type="button">İptal</button>
          <button class="btn btn--danger" id="btn-confirm-yes" type="button">Sil</button>
        </div>
      </div>
    </div>
  `;
}

function _bindModalEvents() {
  const modal  = ROOT.querySelector('#modal-booking');
  const confirm = ROOT.querySelector('#modal-confirm');
  if (!modal) return;

  // Kapat
  ROOT.querySelector('#btn-booking-close')?.addEventListener('click', _closeModal);
  ROOT.querySelector('#btn-booking-cancel')?.addEventListener('click', _closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) _closeModal(); });

  // Kaydet
  ROOT.querySelector('#btn-booking-save')?.addEventListener('click', _saveBooking);

  // Ayrıştır
  ROOT.querySelector('#btn-parse')?.addEventListener('click', () => {
    const raw = ROOT.querySelector('#field-paste')?.value || '';
    const parsed = parsePasteText(raw);
    if (parsed.plaka)     _setField('field-plate', parsed.plaka);
    if (parsed.konteyner) _setField('field-konteyner', parsed.konteyner);
    if (parsed.treyler)   _setField('field-dorse', parsed.treyler);
    if (parsed.surucu)    _setField('field-sofor', parsed.surucu);
    ROOT.querySelector('#field-paste').value = '';
    ROOT.querySelector('#field-plate')?.focus();
  });

  // Label chip toggle
  ROOT.querySelectorAll('.label-chip[data-label]').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('is-checked'));
  });

  // Cut-Off görsel senkronizasyon
  const cutoffCbBind = ROOT.querySelector('#field-cutoff');
  const cutoffLabelBind = cutoffCbBind?.closest('.label-chip');
  if (cutoffCbBind && cutoffLabelBind) {
    cutoffCbBind.addEventListener('change', () => {
      cutoffLabelBind.classList.toggle('is-checked', cutoffCbBind.checked);
    });
  }

  // Klavye
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.target.closest('textarea')) _saveBooking();
    if (e.key === 'Escape') _closeModal();
  });

  // Confirm dialog
  if (confirm) {
    ROOT.querySelector('#btn-confirm-no')?.addEventListener('click', () => {
      confirm.classList.remove('is-open');
      confirm.hidden = true;
      _confirmCallback = null;
    });
    ROOT.querySelector('#btn-confirm-yes')?.addEventListener('click', () => {
      confirm.classList.remove('is-open');
      confirm.hidden = true;
      if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
    });
  }
}

function _openModal(type, idx, editMode) {
  _modalCtx = { type, idx, editMode };
  const modal = ROOT.querySelector('#modal-booking');
  if (!modal) return;

  // Başlık + badge
  ROOT.querySelector('#booking-modal-title').textContent = editMode ? 'Randevu Düzenle' : 'Randevu Ekle';
  const badge = ROOT.querySelector('#booking-modal-badge');
  const slots = type === 'adr' ? ADR_SLOTS : NORMAL_SLOTS;
  const slot  = slots[idx];
  ROOT.querySelector('#booking-slot-info').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5L10 10"/></svg>
    ${toTime(slot.start)} – ${toTime(slot.end)} &nbsp;·&nbsp; Rampa ${type === 'adr' ? '1 (IMO\'lu)' : '2 (IMO\'suz)'}
  `;
  if (badge) {
    badge.innerHTML = `<span class="tag tag--${type === 'adr' ? 'imo' : 'imosuz'}">${type === 'adr' ? "IMO'lu" : "IMO'suz"}</span>`;
  }

  // Alanları temizle
  ['field-plate','field-company','field-konteyner','field-dorse','field-sofor','field-cargo','field-miktar','field-not','field-paste']
    .forEach(id => { const el = ROOT.querySelector(`#${id}`); if (el) { el.value = ''; el.classList.remove('has-error'); } });
  ROOT.querySelectorAll('.label-chip[data-label]').forEach(c => c.classList.remove('is-checked'));
  const cutoff = ROOT.querySelector('#field-cutoff');
  if (cutoff) cutoff.checked = false;
  // Cut-off label chip'i de sıfırla
  const cutoffChip = ROOT.querySelector('.label-chip:not([data-label])');
  if (cutoffChip) cutoffChip.classList.remove('is-checked');

  // Düzenleme modunda doldur
  if (editMode) {
    const booking = _bookingsFor(_selectedDate)[type][idx];
    if (booking) {
      _setField('field-plate', booking.plate);
      _setField('field-company', booking.company);
      _setField('field-konteyner', booking.konteyner);
      _setField('field-dorse', booking.dorse);
      _setField('field-sofor', booking.sofor);
      _setField('field-cargo', booking.cargo);
      _setField('field-miktar', booking.miktar);
      _setField('field-not', booking.not);
      if (cutoff) {
        cutoff.checked = !!booking.cutoff;
        cutoff.closest('.label-chip')?.classList.toggle('is-checked', !!booking.cutoff);
      }
      if (booking.labels) {
        ROOT.querySelectorAll('.label-chip[data-label]').forEach(c => {
          if (booking.labels[c.dataset.label]) c.classList.add('is-checked');
        });
      }
    }
  }

  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.add('is-open');
    ROOT.querySelector('#field-plate')?.focus();
  });
}

function _closeModal() {
  const modal = ROOT.querySelector('#modal-booking');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.addEventListener('transitionend', () => { modal.hidden = true; }, { once: true });
}

function _saveBooking() {
  const requiredIds = [
    'field-plate','field-company','field-konteyner',
    'field-dorse','field-sofor','field-cargo','field-miktar',
  ];
  let valid = true, firstInvalid = null;
  requiredIds.forEach(id => {
    const el = ROOT.querySelector(`#${id}`);
    if (!el?.value.trim()) {
      el?.classList.add('has-error');
      if (!firstInvalid) firstInvalid = el;
      valid = false;
    }
  });
  if (!valid) { firstInvalid?.focus(); return; }

  const plate   = ROOT.querySelector('#field-plate')?.value.toUpperCase().trim();
  const company = ROOT.querySelector('#field-company')?.value.trim();

  const user = getActiveUser();
  const bk = _bookingsFor(_selectedDate);
  const existing = bk[_modalCtx.type][_modalCtx.idx];
  if (existing && user?.role !== 'admin' && existing.createdBy && existing.createdBy !== user?.name) {
    _closeModal(); return;
  }

  const isNew = !existing;
  const labels = {};
  ROOT.querySelectorAll('.label-chip[data-label]').forEach(c => {
    labels[c.dataset.label] = c.classList.contains('is-checked');
  });

  bk[_modalCtx.type][_modalCtx.idx] = {
    plate,
    company,
    cargo:      _getField('field-cargo'),
    konteyner:  _getField('field-konteyner'),
    dorse:      _getField('field-dorse'),
    sofor:      _getField('field-sofor'),
    miktar:     _getField('field-miktar'),
    not:        _getField('field-not'),
    cutoff:     ROOT.querySelector('#field-cutoff')?.checked || false,
    labels,
    createdBy:  user?.name || '',
    createdAt:  Date.now(),
  };

  _closeModal();
  _saveAndRefreshSchedule();

  if (isNew) {
    emit('booking:created', { date: _selectedDate, type: _modalCtx.type, idx: _modalCtx.idx });
  }
}

// ── Confirm ───────────────────────────────────────────────────────────────────

let _confirmCallback = null;

function _showConfirm(message, callback) {
  const confirm = ROOT.querySelector('#modal-confirm');
  if (!confirm) return;
  ROOT.querySelector('#confirm-message').textContent = message;
  _confirmCallback = callback;
  confirm.hidden = false;
  requestAnimationFrame(() => confirm.classList.add('is-open'));
}

// ── Real-time ─────────────────────────────────────────────────────────────────

function _watchDate(dateStr) {
  if (_unsubWatch) { _unsubWatch(); _unsubWatch = null; }
  _unsubWatch = watchBookings(dateStr, (data) => {
    if (data) _allBookings[dateStr] = data;
    else _allBookings[dateStr] = { adr: {}, normal: {} };
    _rtUpdate();
  });
}

function _rtUpdate() {
  if (_view === 'schedule' && _selectedDate) {
    // Sadece timeline container'larını güncelle (modal açıksa dokunma)
    const modal = ROOT.querySelector('#modal-booking');
    if (modal?.classList.contains('is-open')) return;

    const adrEl    = ROOT.querySelector('#timeline-adr');
    const normalEl = ROOT.querySelector('#timeline-normal');
    if (adrEl)    adrEl.innerHTML    = _slotsHTML('adr');
    if (normalEl) normalEl.innerHTML = _slotsHTML('normal');
    _bindScheduleEvents(); // event'leri yeniden bağla
    _initTouchDrag();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _bookingsFor(dateStr) {
  if (!_allBookings[dateStr]) _allBookings[dateStr] = { adr: {}, normal: {} };
  return _allBookings[dateStr];
}

function _canEdit() {
  const user = getActiveUser();
  if (!user) return false;
  
  // Tüm kullanıcılar kendi işlemlerini yapabilir
  return true;
}

function _saveAndRefreshSchedule() {
  saveBookingDate(_selectedDate, JSON.parse(JSON.stringify(_bookingsFor(_selectedDate))))
    .catch(err => console.error('[Randevu] save error:', err));
  // Optimistik güncelleme
  if (_view === 'schedule') {
    const adrEl    = ROOT.querySelector('#timeline-adr');
    const normalEl = ROOT.querySelector('#timeline-normal');
    if (adrEl)    adrEl.innerHTML    = _slotsHTML('adr');
    if (normalEl) normalEl.innerHTML = _slotsHTML('normal');
    _bindScheduleEvents();
    _initTouchDrag();
  }
  if (_view === 'home') _renderHome();
}

function _getField(id) {
  return ROOT.querySelector(`#${id}`)?.value?.trim() || '';
}

function _setField(id, value) {
  const el = ROOT.querySelector(`#${id}`);
  if (el) el.value = value || '';
}

function _getMonthHolidays(year, month) {
  return getMonthDays(year, month).filter(d => isHoliday(d));
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Global API (window.R) ─────────────────────────────────────────────────────

window.R = {
  init,
  render: (type) => {
    if (type) {
      const el = ROOT.querySelector(`#timeline-${type}`);
      if (el) el.innerHTML = _slotsHTML(type);
    }
  },
  _rtUpdate: (freshBookings) => {
    _allBookings = freshBookings;
    _rtUpdate();
  },
  getSelectedDate: () => _selectedDate,
  getEmptySlots: (dateStr) => {
    const bk = _bookingsFor(dateStr);
    const result = [];
    ADR_SLOTS.forEach((slot, idx) => {
      if (!bk.adr[idx]) result.push({ type: 'adr', idx, start: toTime(slot.start), end: toTime(slot.end) });
    });
    NORMAL_SLOTS.forEach((slot, idx) => {
      if (!bk.normal[idx]) result.push({ type: 'normal', idx, start: toTime(slot.start), end: toTime(slot.end) });
    });
    return result;
  },
  bookSlot: (dateStr, type, idx, data) => {
    const bk = _bookingsFor(dateStr);
    if (!bk[type] || bk[type][idx]) return false;
    bk[type][idx] = {
      plate:     data.plate || '',
      company:   data.company || '',
      cargo:     data.cargo || data.urun || '',
      konteyner: data.konteyner || '',
      dorse:     data.dorse || data.dorsePlaka || '',
      sofor:     data.sofor || data.soforAdi || '',
      miktar:    data.miktar || '',
      not:       data.not || '',
      cutoff:    data.cutoff || false,
      labels:    data.labels || {},
      createdBy: data.createdBy || '',
      createdAt: Date.now(),
    };
    saveBookingDate(dateStr, JSON.parse(JSON.stringify(bk)));
    return true;
  },
  clearSlot: async (dateStr, type, idx) => {
    // Hedef tarih bellekte değilse önce Firestore'dan yükle
    if (!_allBookings[dateStr]) {
      _allBookings[dateStr] = await loadBookingDate(dateStr);
    }
    const bk = _bookingsFor(dateStr);
    if (!bk[type]) return;
    delete bk[type][idx];
    saveBookingDate(dateStr, JSON.parse(JSON.stringify(bk)));
  },
};
