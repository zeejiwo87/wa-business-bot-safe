const db = require('../db');

const {
  isOwner,
} = require('../utils/format');


// ====================================================================
// ⚙️ SETTING KEY
//
// Nama key lama tetap dipertahankan agar kompatibel dengan router.js
// yang saat ini masih membaca:
//
// getSetting('log_order_messages', 'on')
//
// Walaupun namanya masih "order", sekarang fungsinya adalah
// pengaturan AUDIT LOG command secara umum.
// ====================================================================

const AUDIT_LOG_SETTING_KEY =
  'log_order_messages';


// ====================================================================
// 👑 CEK OWNER
// ====================================================================

function ensureOwner(ctx) {
  if (
    !isOwner(
      ctx.msg
    )
  ) {
    return false;
  }

  return true;
}


// ====================================================================
// ⚙️ PASTIKAN TABLE SETTINGS ADA
// ====================================================================

db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`).run();


// ====================================================================
// 🔍 AMBIL SETTING
// ====================================================================

function getSetting(
  key,
  fallback = ''
) {
  try {
    const row =
      db.prepare(`
        SELECT value
        FROM settings
        WHERE key = ?
      `).get(
        key
      );

    return (
      row?.value ??
      fallback
    );

  } catch (err) {
    console.error(
      '[SETTING GET ERROR]',
      err
    );

    return fallback;
  }
}


// ====================================================================
// 💾 SIMPAN SETTING
// ====================================================================

function setSetting(
  key,
  value
) {
  db.prepare(`
    INSERT INTO settings (
      key,
      value
    )

    VALUES (?, ?)

    ON CONFLICT(key)
    DO UPDATE SET
      value = excluded.value
  `).run(
    key,
    value
  );
}


// ====================================================================
// 📝 COMMAND SETLOG
//
// .setlog
// .setlog status
// .setlog on
// .setlog off
// ====================================================================

async function setlog(ctx) {

  // ==================================================================
  // 👑 KHUSUS OWNER
  // ==================================================================

  if (
    !ensureOwner(
      ctx
    )
  ) {
    return;
  }


  const value =
    String(
      ctx.args?.[0] || ''
    )
      .trim()
      .toLowerCase();


  // ==================================================================
  // 📊 STATUS
  // ==================================================================

  if (
    !value ||
    value === 'status'
  ) {
    const current =
      getSetting(
        AUDIT_LOG_SETTING_KEY,
        'on'
      );


    return ctx.reply(
`📝 *AUDIT LOG*

Status:
${
  current === 'on'
    ? '*AKTIF* ✅'
    : '*NONAKTIF* ⛔'
}

Gunakan:
• *.setlog on*
• *.setlog off*`
    );
  }


  // ==================================================================
  // ❌ INPUT TIDAK VALID
  // ==================================================================

  if (
    ![
      'on',
      'off',
    ].includes(
      value
    )
  ) {
    return ctx.reply(
`❌ Format tidak valid.

Gunakan:
• *.setlog on*
• *.setlog off*
• *.setlog status*`
    );
  }


  // ==================================================================
  // 💾 SIMPAN
  // ==================================================================

  try {
    setSetting(
      AUDIT_LOG_SETTING_KEY,
      value
    );


    if (
      value === 'on'
    ) {
      return ctx.reply(
`📝 *AUDIT LOG AKTIF* ✅

Penggunaan command bot akan dicatat ke audit log.

Audit log dapat diperiksa melalui:
*.reset stats*

Untuk mematikannya:
*.setlog off*`
      );
    }


    return ctx.reply(
`📝 *AUDIT LOG NONAKTIF* ⛔

Penggunaan command baru tidak akan dicatat ke audit log.

Data audit lama tidak dihapus.

Jika ingin menghapus audit lama:
*.reset logs confirm*`
    );

  } catch (err) {
    console.error(
      '[SETLOG ERROR]',
      err
    );


    return ctx.reply(
      '❌ Gagal mengubah pengaturan audit log.'
    );
  }
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = {
  setlog,
};