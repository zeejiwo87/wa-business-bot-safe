const db = require('../db');

const {
  now,
} = require('../utils/format');


// ====================================================================
// 🗃️ PASTIKAN TABLE AUDIT LOG ADA
// ====================================================================

db.prepare(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    event_type TEXT NOT NULL DEFAULT '',
    user_jid TEXT NOT NULL DEFAULT '',
    user_number TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL
  )
`).run();


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
// 📝 SIMPAN AUDIT LOG
// ====================================================================

function logAudit({
  eventType,
  userJid,
  userNumber,
  content,
}) {
  try {
    const safeEventType =
      String(
        eventType || ''
      )
        .trim()
        .slice(
          0,
          100
        );


    const safeUserJid =
      String(
        userJid || ''
      )
        .trim()
        .slice(
          0,
          255
        );


    const safeUserNumber =
      String(
        userNumber || ''
      )
        .replace(
          /[^\d]/g,
          ''
        )
        .slice(
          0,
          30
        );


    // Batasi ukuran log supaya database tidak membengkak
    // akibat input command yang sangat panjang.
    const safeContent =
      String(
        content || ''
      ).slice(
        0,
        5000
      );


    const result =
      db.prepare(`
        INSERT INTO audit_logs (
          event_type,
          user_jid,
          user_number,
          content,
          created_at
        )

        VALUES (?, ?, ?, ?, ?)
      `).run(
        safeEventType,
        safeUserJid,
        safeUserNumber,
        safeContent,
        now()
      );


    return result;

  } catch (err) {
    console.error(
      '[AUDIT LOG ERROR]',
      err
    );

    return null;
  }
}


// ====================================================================
// 🔍 AMBIL SETTING
// ====================================================================

function getSetting(
  key,
  fallback = ''
) {
  try {
    const settingKey =
      String(
        key || ''
      ).trim();


    if (!settingKey) {
      return fallback;
    }


    const row =
      db.prepare(`
        SELECT value
        FROM settings
        WHERE key = ?
        LIMIT 1
      `).get(
        settingKey
      );


    return (
      row?.value ??
      fallback
    );

  } catch (err) {
    console.error(
      '[GET SETTING ERROR]',
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
  const settingKey =
    String(
      key || ''
    ).trim();


  if (!settingKey) {
    throw new Error(
      'Setting key tidak boleh kosong.'
    );
  }


  const settingValue =
    String(
      value ?? ''
    );


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
    settingKey,
    settingValue
  );


  return settingValue;
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = {
  logAudit,
  getSetting,
  setSetting,
};