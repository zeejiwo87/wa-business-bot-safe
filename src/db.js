const Database = require('better-sqlite3');
const path = require('path');


// ====================================================================
// 🗃️ DATABASE PATH
// ====================================================================

const dbPath =
  path.join(
    __dirname,
    '..',
    'database.sqlite'
  );


const db =
  new Database(
    dbPath
  );


// ====================================================================
// ⚙️ SQLITE CONFIG
// ====================================================================

// WAL lebih aman untuk bot yang sering baca/tulis database.
db.pragma(
  'journal_mode = WAL'
);


// Tunggu beberapa detik jika database sedang sibuk,
// daripada langsung melempar SQLITE_BUSY.
db.pragma(
  'busy_timeout = 5000'
);


// Mode yang cukup aman sekaligus ringan.
db.pragma(
  'synchronous = NORMAL'
);


// ====================================================================
// 🗃️ TABLE YANG MASIH DIGUNAKAN
// ====================================================================

db.exec(`

  -- ================================================================
  -- ⚙️ SETTING BOT
  -- ================================================================

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );


  -- ================================================================
  -- 📝 AUDIT LOG
  -- ================================================================

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    event_type TEXT NOT NULL DEFAULT '',
    user_jid TEXT NOT NULL DEFAULT '',
    user_number TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL
  );


  -- ================================================================
  -- 👥 SETTING FITUR PER GRUP
  --
  -- .grup on
  -- .grup off
  -- .grup status
  -- ================================================================

  CREATE TABLE IF NOT EXISTS group_features (
    group_jid TEXT PRIMARY KEY,

    enabled INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );


  -- ================================================================
  -- 👋 PRIVATE WELCOME
  --
  -- Menandai nomor yang SUDAH pernah mendapat welcome.
  --
  -- Jangan dihapus sembarangan karena customer lama akan dianggap
  -- sebagai nomor baru jika data ini hilang.
  -- ================================================================

  CREATE TABLE IF NOT EXISTS private_welcome_logs (
    chat_jid TEXT PRIMARY KEY,

    last_sent_at INTEGER NOT NULL
  );


  -- ================================================================
  -- 📝 CUSTOM TEXT
  --
  -- .addtext
  -- .deltext
  -- ================================================================

  CREATE TABLE IF NOT EXISTS custom_texts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    trigger_key TEXT UNIQUE NOT NULL,
    trigger_text TEXT NOT NULL,
    response_text TEXT NOT NULL,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );


  -- ================================================================
  -- 🤖 AI SETTING
  --
  -- .aion
  -- .aioff
  -- .aistatus
  -- ================================================================

  CREATE TABLE IF NOT EXISTS ai_settings (
    setting_key TEXT PRIMARY KEY,

    setting_value TEXT NOT NULL
  );

`);


// ====================================================================
// 🚀 INDEX
// ====================================================================

// Mempercepat pembacaan audit log berdasarkan waktu.
db.exec(`
  CREATE INDEX IF NOT EXISTS
  idx_audit_logs_created_at
  ON audit_logs(created_at);
`);


// ====================================================================
// ⚙️ DEFAULT SETTINGS
// ====================================================================

// Nama key lama dipertahankan supaya kompatibel dengan router.js.
// Walaupun namanya "log_order_messages", sekarang kegunaannya
// adalah mengaktifkan / mematikan AUDIT LOG command secara umum.

db.prepare(`
  INSERT OR IGNORE INTO settings (
    key,
    value
  )

  VALUES (?, ?)
`).run(
  'log_order_messages',
  'on'
);


// ====================================================================
// 🤖 DEFAULT AUTO AI = OFF
// ====================================================================

// AI customer service otomatis harus OFF secara default.
//
// Baru aktif setelah owner:
// .aion
//
// Menggunakan key baru yang sama dengan aiText.js:
// premium_auto_ai_enabled

db.prepare(`
  INSERT OR IGNORE INTO ai_settings (
    setting_key,
    setting_value
  )

  VALUES (?, ?)
`).run(
  'premium_auto_ai_enabled',
  '0'
);


// ====================================================================
// EXPORT
// ====================================================================

module.exports = db;