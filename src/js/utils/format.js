/**
 * Formatting utilities — plaka, konteyner, firma, vs.
 */

/** Plakayı standart forma dönüştür: "34abc123" → "34 ABC 123" */
export function formatPlaka(raw) {
  if (!raw) return '';
  const clean = raw.replace(/\s+/g, '').toUpperCase();

  // 34 ABC 1234 veya 34 A 123 formatı
  const match = clean.match(/^(\d{2})([A-Z]{1,3})(\d{2,5})$/);
  if (match) return `${match[1]} ${match[2]} ${match[3]}`;

  return clean;
}

/** Konteyner numarasını formatla: "PETU1234567" → "PETU 123456-7" */
export function formatKonteyner(raw) {
  if (!raw) return '';
  const clean = raw.replace(/[\s-]/g, '').toUpperCase();

  // PETU 123456-7 formatı (ISO 6346)
  const match = clean.match(/^([A-Z]{4})(\d{6})(\d)$/);
  if (match) return `${match[1]} ${match[2]}-${match[3]}`;

  // 11 karakter ama rakam sonu yoksa
  if (clean.length === 11) {
    return `${clean.slice(0,4)} ${clean.slice(4,10)}-${clean.slice(10)}`;
  }

  return clean;
}

/** Araç tipi etiket */
export function formatAracTipi(type) {
  const labels = {
    tir: 'TIR',
    kamyon: 'Kamyon',
    tenteli: 'Tenteli',
    frigorifik: 'Frigorifik',
    konteyner: 'Konteyner',
    tanker: 'Tanker',
    diger: 'Diğer',
  };
  return labels[type] || type || '—';
}

/** Firma adı — boşsa tire */
export function formatFirma(firma) {
  return firma?.trim() || '—';
}

/** Sürücü adı — boşsa tire */
export function formatSurucu(ad) {
  return ad?.trim() || '—';
}

/** Sayı → 2 haneli sıfır dolgu */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Timestamp → "14:35" */
export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Timestamp → "15 Mart 14:35" */
export function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  return `${d.getDate()} ${months[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Bayrak emoji → IMO tip */
export function getEntryTypeBadge(type) {
  const badges = {
    imo:     { label: 'IMO\'LU',  class: 'imo' },
    imosuz:  { label: 'IMO\'SUZ', class: 'imosuz' },
    ithalat: { label: 'İTHALAT', class: 'ithalat' },
  };
  return badges[type] || { label: type, class: 'neutral' };
}

/** Flag emoji'lerin tooltip metni */
export const FLAG_LABELS = {
  '🚩': 'IMO',
  '⛓️': 'Zincir',
  '⭐': 'Öncelikli',
  '📦': 'Konteyner',
  '💧': 'Sıvı',
};

/** İnsan okunabilir dosya boyutu */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Avatar için baş harfleri: "Ahmet Yılmaz" → "AY" */
export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** İsimden deterministik renk indeksi (0-7) */
export function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 8;
}
