/**
 * Paste Parser — plaka ve konteyner numarası yapıştırma desteği
 *
 * Hem Randevu hem Teyit modülünde ortak kullanılır.
 * Paste edilen metinden plaka, konteyner, treyler ve sürücü bilgilerini çıkarır.
 */

/**
 * Plaka formatını tanı ve temizle
 * Desteklenen formatlar: "34ABC123", "34 ABC 123", "34-ABC-123"
 * @param {string} text
 * @returns {{ plaka: string, valid: boolean }}
 */
export function parsePlaka(text) {
  if (!text) return { plaka: '', valid: false };
  const clean = text.replace(/[\s\-\.]/g, '').toUpperCase();
  const valid = /^\d{2}[A-Z]{1,3}\d{2,5}$/.test(clean);

  let plaka = clean;
  const match = clean.match(/^(\d{2})([A-Z]{1,3})(\d{2,5})$/);
  if (match) plaka = `${match[1]} ${match[2]} ${match[3]}`;

  return { plaka, valid };
}

/**
 * Konteyner numarasını tanı (ISO 6346)
 * Format: LLLLNNNNNN-D (4 harf + 6 rakam + 1 kontrol hanesi)
 * @param {string} text
 * @returns {{ konteyner: string, valid: boolean }}
 */
export function parseKonteyner(text) {
  if (!text) return { konteyner: '', valid: false };
  const clean = text.replace(/[\s\-]/g, '').toUpperCase();
  const match = clean.match(/^([A-Z]{4})(\d{6})(\d)$/);

  if (match) {
    return { konteyner: `${match[1]} ${match[2]}-${match[3]}`, valid: true };
  }

  // 11 karakter genel
  if (/^[A-Z]{4}\d{7}$/.test(clean)) {
    return {
      konteyner: `${clean.slice(0,4)} ${clean.slice(4,10)}-${clean.slice(10)}`,
      valid: true,
    };
  }

  return { konteyner: clean, valid: false };
}

/**
 * Yapıştırılan metni token'lara bölerek araç bilgilerini çıkar.
 * Hem tek satır hem çok satır yapıştırmayı destekler.
 *
 * Örnek girişler:
 *   "34ABC1234 PETU1234567 Mehmet Yilmaz"
 *   "34 ABC 1234\nPETU 123456-7\n34 TT 9901\nMehmet Yılmaz"
 *
 * @param {string} pasteText
 * @returns {{ plaka: string, konteyner: string, treyler: string, surucu: string }}
 */
export function parsePasteText(pasteText) {
  if (!pasteText?.trim()) return {};

  const rawUpper = pasteText.trim().toUpperCase();
  const result = { plaka: '', konteyner: '', treyler: '', surucu: '' };

  // Önce konteyner numarasını bul (LLLLNNNNNN-N veya LLLLNNNNNN)
  const conMatch = rawUpper.match(/[A-Z]{4}\d{6}-\d/) || rawUpper.match(/[A-Z]{4}\d{6}/);
  if (conMatch) {
    result.konteyner = parseKonteyner(conMatch[0]).konteyner;
  }

  // Konteyner'ı metinden çıkar; kalan kısımı whitespace'e göre token'la
  let remaining = rawUpper;
  if (conMatch) remaining = remaining.replace(conMatch[0], ' ');

  const tokens = remaining.split(/\s+/).filter(Boolean);
  const plates = [];
  const soforWords = [];

  tokens.forEach(t => {
    const hasLetter = /[A-Z]/.test(t);
    const hasDigit  = /[0-9]/.test(t);
    if (hasLetter && hasDigit && t.length >= 4) {
      plates.push(t);
    } else if (hasLetter && !hasDigit && t.length >= 2) {
      soforWords.push(t);
    }
  });

  if (plates.length > 0) result.plaka   = plates[0];
  if (plates.length > 1) result.treyler = plates[1];

  if (soforWords.length > 0) {
    result.surucu = soforWords
      .map(w => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
  }

  return result;
}

/**
 * Input'a paste event listener ekle
 * @param {HTMLInputElement} input
 * @param {(parsed: object) => void} onPaste - parse edilen veri ile callback
 */
export function attachPasteParser(input, onPaste) {
  input.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') || '';
    const lines = text.trim().split(/[\n\r]+/).filter(Boolean);

    // Çok satırlıysa parse et
    if (lines.length > 1) {
      e.preventDefault();
      const parsed = parsePasteText(text);
      onPaste(parsed);
    }
    // Tek satırsa normal input davranışı
  });
}
