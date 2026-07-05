const Database = require('better-sqlite3');
const path = require('path');

const products = require('./data/products');
const services = require('./data/services');
const { now } = require('./utils/format');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  variants_json TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  min_price INTEGER,
  max_price INTEGER,
  unit TEXT,
  emoji TEXT,
  notes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_jid TEXT NOT NULL,
  user_number TEXT NOT NULL,
  user_name TEXT,
  order_type TEXT NOT NULL,
  item_key TEXT,
  item_name TEXT NOT NULL,
  variant TEXT,
  price INTEGER,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  user_jid TEXT,
  user_number TEXT,
  content TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_features (
  group_jid TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS private_welcome_logs (
  chat_jid TEXT PRIMARY KEY,
  last_sent_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_key TEXT UNIQUE NOT NULL,
  trigger_text TEXT NOT NULL,
  response_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

/*
  Penting:
  DO NOTHING dipakai agar data produk/jasa yang sudah diedit lewat WhatsApp
  tidak tertimpa lagi oleh file src/data/products.js dan src/data/services.js
  setiap bot direstart.
*/

const insertProductIfNotExists = db.prepare(`
INSERT INTO products (key, name, category, variants_json, notes_json, updated_at)
VALUES (@key, @name, @category, @variants_json, @notes_json, @updated_at)
ON CONFLICT(key) DO NOTHING
`);

const insertServiceIfNotExists = db.prepare(`
INSERT INTO services (key, name, min_price, max_price, unit, emoji, notes_json, updated_at)
VALUES (@key, @name, @min_price, @max_price, @unit, @emoji, @notes_json, @updated_at)
ON CONFLICT(key) DO NOTHING
`);

function seed() {
  const t = now();

  const tx = db.transaction(() => {
    for (const p of products) {
      insertProductIfNotExists.run({
        key: p.key,
        name: p.name,
        category: p.category || null,
        variants_json: JSON.stringify(p.variants || []),
        notes_json: JSON.stringify(p.notes || []),
        updated_at: t,
      });
    }

    for (const s of services) {
      insertServiceIfNotExists.run({
        key: s.key,
        name: s.name,
        min_price: s.min || null,
        max_price: s.max || null,
        unit: s.unit || null,
        emoji: s.emoji || null,
        notes_json: JSON.stringify(s.notes || []),
        updated_at: t,
      });
    }

    db.prepare(`
      INSERT OR IGNORE INTO settings (key, value)
      VALUES (?, ?)
    `).run('log_order_messages', 'on');
  });

  tx();
}

seed();

module.exports = db;