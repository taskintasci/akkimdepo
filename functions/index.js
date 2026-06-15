/**
 * Firebase Cloud Functions
 *
 * teyitBildirimi   — Firestore teyit belgesi değişince e-posta gönderir
 * createAuthUser   — Admin: Firebase Auth kullanıcısı oluşturur + custom claim atar
 * deleteAuthUser   — Admin: Firebase Auth kullanıcısını siler
 * updateAuthUser   — Admin: displayName, email, rol günceller
 * sendPasswordReset — Admin: şifre sıfırlama e-postası gönderir
 */

import { onDocumentWritten }         from 'firebase-functions/v2/firestore';
import { onCall, HttpsError }        from 'firebase-functions/v2/https';
import { getFirestore }              from 'firebase-admin/firestore';
import { getAuth }                   from 'firebase-admin/auth';
import { initializeApp }             from 'firebase-admin/app';
import nodemailer                    from 'nodemailer';

initializeApp();

const APP_URL = 'https://akkim-plan.web.app/';
const F = `'Segoe UI', Arial, Helvetica, sans-serif`;

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(+y, +m - 1, +d);
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
    + ' ' + ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'][date.getDay()];
}

function _tipBadge(aracTipi) {
  if (aracTipi === 'imo')
    return `<span style="font-family:${F};display:inline-block;background:#fff4ed;color:#c2410c;padding:3px 9px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:.2px;">IMO'lu</span>`;
  if (aracTipi === 'imosuz')
    return `<span style="font-family:${F};display:inline-block;background:#f0fdf4;color:#15803d;padding:3px 9px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:.2px;">IMO'suz</span>`;
  return `<span style="font-family:${F};color:#a0aec0;font-size:12px;">—</span>`;
}

function _labelsText(labels) {
  if (!labels || typeof labels !== 'object') return '—';
  const MAP = { ozel: 'Özel', lashing: 'Lashing', karton: 'Karton', jel: 'Nem Çekici' };
  const aktif = Object.entries(labels).filter(([, v]) => v === true).map(([k]) => MAP[k] || k);
  return aktif.length ? aktif.join(', ') : '—';
}

function _cell(label, value) {
  return `
    <td width="50%" style="font-family:${F};padding:11px 14px;border-bottom:1px solid #f0f4f8;vertical-align:top;word-break:break-word;">
      <div style="font-size:10px;font-weight:600;color:#9baab8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">${label}</div>
      <div style="font-size:14px;font-weight:400;color:#1e293b;line-height:1.4;">${_esc(value) || '—'}</div>
    </td>`;
}

function _cardHeader(item) {
  const cutoff = item.cutoff
    ? `<span style="font-family:${F};display:inline-block;background:#fefce8;color:#92400e;padding:3px 9px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:.2px;margin-right:6px;">Cut-Off</span>`
    : '';
  return `
    <tr>
      <td colspan="2" style="font-family:${F};padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e8edf2;white-space:nowrap;">
        ${cutoff}${_tipBadge(item.aracTipi)}
      </td>
    </tr>`;
}

function buildCardBekliyor(item) {
  return `
    <div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:12px;overflow:hidden;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${_cardHeader(item)}
        <tr>
          ${_cell('PLAKA', item.plaka)}
          ${_cell('KONTEYNER', item.konteynerNo)}
        </tr>
        <tr>
          ${_cell('DORSE', item.dorsePlaka)}
          ${_cell('ŞOFÖR', item.soforAdi)}
        </tr>
        <tr>
          ${_cell('GİRİŞ', item.createdBy)}
          <td width="50%" style="padding:11px 14px;border-bottom:1px solid #f0f4f8;"></td>
        </tr>
      </table>
    </div>`;
}

function buildCardTeyit(item) {
  const notRow = item.not
    ? `<tr>
        <td colspan="2" style="font-family:${F};padding:11px 14px;border-bottom:1px solid #f0f4f8;word-break:break-word;">
          <div style="font-size:10px;font-weight:600;color:#9baab8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">NOT</div>
          <div style="font-size:14px;color:#1e293b;line-height:1.4;">${_esc(item.not)}</div>
        </td>
      </tr>`
    : '';
  return `
    <div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:12px;overflow:hidden;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${_cardHeader(item)}
        <tr>
          ${_cell('PLAKA', item.plaka)}
          ${_cell('KONTEYNER', item.konteynerNo)}
        </tr>
        <tr>
          ${_cell('DORSE', item.dorsePlaka)}
          ${_cell('ŞOFÖR', item.soforAdi)}
        </tr>
        <tr><td colspan="2" style="padding:0;border-top:2px dashed #e2e8f0;"></td></tr>
        <tr>
          ${_cell('FİRMA', item.firma)}
          ${_cell('ÜRÜN', item.urun)}
        </tr>
        <tr>
          ${_cell('MİKTAR', item.miktar)}
          ${_cell('YAPILACAKLAR', _labelsText(item.labels))}
        </tr>
        ${notRow}
        <tr>
          <td colspan="2" style="font-family:${F};padding:11px 14px;background:#f8fafc;border-top:1px solid #e8edf2;">
            <div style="font-size:10px;font-weight:600;color:#9baab8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">TEYİT EDEN</div>
            <div style="font-size:14px;font-weight:600;color:#15803d;">&#10003; ${_esc(item.teyitEden) || '—'}</div>
          </td>
        </tr>
      </table>
    </div>`;
}

function _header(bgColor, icon, title, subtitle) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${bgColor}">
      <tr>
        <td style="font-family:${F};background-color:${bgColor};padding:28px 28px 24px;">
          <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,.65);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:10px;">Akkim Depolama Merkezi</div>
          <div style="font-size:20px;font-weight:700;color:#fff;line-height:1.2;">${icon}&nbsp; ${title}</div>
          <div style="font-size:13px;font-weight:400;color:rgba(255,255,255,.8);margin-top:6px;">${subtitle}</div>
        </td>
      </tr>
    </table>`;
}

function _footer(linkColor) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-family:${F};background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;text-align:center;">
          <span style="font-size:12px;color:#b0bec5;">Otomatik bildirim &middot; </span>
          <a href="${APP_URL}" style="font-size:12px;color:${linkColor};text-decoration:none;">${APP_URL}</a>
        </td>
      </tr>
    </table>`;
}

function buildHtmlBekliyor(dateStr, araclar) {
  const tarih = formatDate(dateStr);
  const cards = araclar.map(buildCardBekliyor).join('');
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f5;font-family:${F};">
  <div style="max-width:580px;margin:28px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);">
    ${_header('#2563eb', '🚛', 'Teyit Bekleyen Araç Var', `${tarih} &middot; ${araclar.length} araç teyit bekliyor`)}
    <div style="padding:24px 28px;">
      <p style="margin:0 0 20px;font-size:14px;color:#4a5568;line-height:1.6;">Aşağıdaki araçlar için yükleme bilgisi girilmesi bekleniyor.</p>
      ${cards}
      <div style="text-align:center;margin:24px 0 20px;">
        <a href="${APP_URL}" style="font-family:${F};display:inline-block;background:#2563eb;color:#ffffff;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Günlük Teyit Ekranını Aç</a>
      </div>
    </div>
    ${_footer('#2563eb')}
  </div>
</body></html>`;
}

function buildHtmlTeyit(dateStr, araclar) {
  const tarih = formatDate(dateStr);
  const cards = araclar.map(buildCardTeyit).join('');
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f5;font-family:${F};">
  <div style="max-width:580px;margin:28px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);">
    ${_header('#15803d', '✅', 'Araç Teyit Edildi', `${tarih} &middot; ${araclar.length} araç teyit edildi`)}
    <div style="padding:24px 28px;">
      <p style="margin:0 0 20px;font-size:14px;color:#4a5568;line-height:1.6;">Aşağıdaki araçlar teyit edildi ve yükleme bilgileri sisteme işlendi.</p>
      ${cards}
      <div style="text-align:center;margin:24px 0 4px;">
        <a href="${APP_URL}" style="font-family:${F};display:inline-block;background:#15803d;color:#ffffff;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Günlük Teyit Ekranını Aç</a>
      </div>
    </div>
    ${_footer('#15803d')}
  </div>
</body></html>`;
}

// ── Teyit bildirimi ───────────────────────────────────────────────────────────

export const teyitBildirimi = onDocumentWritten('teyit/{date}', async (event) => {
  const before = event.data.before?.exists ? event.data.before.data() : null;
  const after  = event.data.after?.exists  ? event.data.after.data()  : null;

  if (!after?.items) return null;

  const beforeMap = new Map((before?.items || []).map(i => [i.id, i]));

  const newBekliyor = after.items.filter(i =>
    !beforeMap.has(i.id) && (!i.asama || i.asama === 'bekliyor')
  );

  const newTeyit = after.items.filter(i => {
    const prev = beforeMap.get(i.id);
    return prev && prev.asama !== 'teyit' && i.asama === 'teyit';
  });

  if (!newBekliyor.length && !newTeyit.length) return null;

  const db = getFirestore();

  const personsSnap = await db.doc('config/persons').get();
  const personsList = personsSnap.data()?.list || [];

  const allRecipients = personsList
    .filter(p => p.email && p.email.includes('@') && p.role !== 'guest')
    .map(p => `"${p.name}" <${p.email}>`);

  const smtpSnap = await db.doc('config/smtp').get();
  const smtp     = smtpSnap.data();

  if (!smtp?.host || !smtp?.user || !smtp?.pass) {
    console.error('[teyitBildirimi] SMTP ayarları eksik.');
    return null;
  }

  const transporter = nodemailer.createTransport({
    host:   smtp.host,
    port:   smtp.port || 587,
    secure: smtp.port === 465,
    auth:   { user: smtp.user, pass: smtp.pass },
  });

  const dateStr = event.params.date;
  const tarihTR = formatDate(dateStr);
  const from    = `"Akkim İthalat ve İhracat Planı" <${smtp.user}>`;

  if (newBekliyor.length && allRecipients.length) {
    await transporter.sendMail({
      from,
      to:      allRecipients.join(', '),
      subject: `🚛 Teyit Bekleyen Araç — ${tarihTR}`,
      html:    buildHtmlBekliyor(dateStr, newBekliyor),
    });
  }

  if (newTeyit.length) {
    const teyitEdenler = new Set(newTeyit.map(i => i.teyitEden).filter(Boolean));
    const teyitRecipients = personsList
      .filter(p => p.email && p.email.includes('@') && (
        p.role === 'wms_operator' || p.role === 'wms' || teyitEdenler.has(p.name)
      ))
      .map(p => `"${p.name}" <${p.email}>`);

    if (teyitRecipients.length) {
      await transporter.sendMail({
        from,
        to:      teyitRecipients.join(', '),
        subject: `✅ Araç Teyit Edildi — ${tarihTR}`,
        html:    buildHtmlTeyit(dateStr, newTeyit),
      });
    }
  }

  return null;
});

// ── Kullanıcı yönetimi (sadece admin) ─────────────────────────────────────────

function _assertAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Giriş yapılmamış.');
  if (request.auth.token.role !== 'admin')
    throw new HttpsError('permission-denied', 'Bu işlem için admin yetkisi gereklidir.');
}

export const createAuthUser = onCall(async (request) => {
  _assertAdmin(request);

  const { name, email, password, role = 'mht_operator' } = request.data;
  if (!name || !email || !password)
    throw new HttpsError('invalid-argument', 'Ad, e-posta ve şifre zorunludur.');

  const auth = getAuth();
  const db   = getFirestore();

  // Firebase Auth kullanıcısı oluştur
  const userRecord = await auth.createUser({
    email,
    password,
    displayName: name,
  });

  // Custom claim ata
  await auth.setCustomUserClaims(userRecord.uid, { role });

  // Persons listesine ekle
  const personsRef = db.doc('config/persons');
  const snap = await personsRef.get();
  const list = snap.data()?.list || [];
  list.push({ uid: userRecord.uid, id: userRecord.uid, name, email, role });
  await personsRef.set({ list });

  return { uid: userRecord.uid };
});

export const deleteAuthUser = onCall(async (request) => {
  _assertAdmin(request);

  const { uid } = request.data;
  if (!uid) throw new HttpsError('invalid-argument', 'uid zorunludur.');

  const auth = getAuth();
  const db   = getFirestore();

  // Firebase Auth'ta yoksa (eski Firestore-only kayıt) sessizce geç
  try {
    await auth.deleteUser(uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }

  const personsRef = db.doc('config/persons');
  const snap = await personsRef.get();
  const list = (snap.data()?.list || []).filter(p => p.uid !== uid && p.id !== uid);
  await personsRef.set({ list });

  return { success: true };
});

export const updateAuthUser = onCall(async (request) => {
  _assertAdmin(request);

  const { uid, name, email, role } = request.data;
  if (!uid) throw new HttpsError('invalid-argument', 'uid zorunludur.');

  const auth = getAuth();
  const db   = getFirestore();

  const authUpdate = {};
  if (name)  authUpdate.displayName = name;
  if (email) authUpdate.email       = email;
  if (Object.keys(authUpdate).length) await auth.updateUser(uid, authUpdate);
  if (role)  await auth.setCustomUserClaims(uid, { role });

  // Persons listesini güncelle
  const personsRef = db.doc('config/persons');
  const snap = await personsRef.get();
  const list = snap.data()?.list || [];
  const idx = list.findIndex(p => p.uid === uid || p.id === uid);
  if (idx >= 0) {
    if (name)  list[idx].name  = name;
    if (email) list[idx].email = email;
    if (role)  list[idx].role  = role;
  }
  await personsRef.set({ list });

  return { success: true };
});

export const sendPasswordReset = onCall(async (request) => {
  _assertAdmin(request);

  const { email } = request.data;
  if (!email) throw new HttpsError('invalid-argument', 'E-posta zorunludur.');

  const db       = getFirestore();
  const smtpSnap = await db.doc('config/smtp').get();
  const smtp     = smtpSnap.data();

  if (!smtp?.host || !smtp?.user || !smtp?.pass) {
    // SMTP yoksa Firebase'in built-in sıfırlama linkini oluştur
    const link = await getAuth().generatePasswordResetLink(email);
    console.log('[sendPasswordReset] Reset link:', link);
    return { success: true };
  }

  const link = await getAuth().generatePasswordResetLink(email);

  const transporter = nodemailer.createTransport({
    host:   smtp.host,
    port:   smtp.port || 587,
    secure: smtp.port === 465,
    auth:   { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from:    `"Akkim İthalat ve İhracat Planı" <${smtp.user}>`,
    to:      email,
    subject: 'Şifre Sıfırlama — Akkim İthalat ve İhracat Planı',
    html: `
      <div style="font-family:${F};max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="font-size:18px;color:#0f172a;">Şifre Sıfırlama</h2>
        <p style="color:#4a5568;font-size:14px;line-height:1.6;">
          Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz. Bağlantı 1 saat geçerlidir.
        </p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Şifremi Sıfırla</a>
        </div>
        <p style="color:#94a3b8;font-size:12px;">Bu e-postayı siz talep etmediyseniz görmezden gelin.</p>
      </div>
    `,
  });

  return { success: true };
});
