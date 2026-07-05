const db = require('../db');
const { makeOrderId, now } = require('../utils/format');

function createOrder({ userJid, userNumber, userName, orderType, itemKey, itemName, variant, price, detail }) {
  const id = makeOrderId();
  const t = now();
  db.prepare(`
    INSERT INTO orders (id, user_jid, user_number, user_name, order_type, item_key, item_name, variant, price, detail, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, userJid, userNumber, userName || '', orderType, itemKey || '', itemName, variant || '', price ?? null, detail || '', t, t);
  return getOrder(id);
}

function getOrder(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(String(id).toUpperCase());
}

function listOrders(limit = 20) {
  return db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit);
}

function listUserOrders(userNumber, limit = 10) {
  return db.prepare('SELECT * FROM orders WHERE user_number = ? ORDER BY created_at DESC LIMIT ?').all(userNumber, limit);
}

function setStatus(id, status) {
  const allowed = ['pending', 'waiting_payment', 'proses', 'selesai', 'batal', 'revisi'];
  if (!allowed.includes(status)) throw new Error(`Status tidak valid. Pilihan: ${allowed.join(', ')}`);
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), String(id).toUpperCase());
  return getOrder(id);
}

function setAdminNote(id, note) {
  db.prepare('UPDATE orders SET admin_note = ?, updated_at = ? WHERE id = ?').run(note, now(), String(id).toUpperCase());
  return getOrder(id);
}

function cancelOrder(id, userNumber) {
  const order = getOrder(id);
  if (!order) return null;
  if (order.user_number !== userNumber) throw new Error('Order ini bukan milik nomor kamu.');
  if (['selesai', 'batal'].includes(order.status)) throw new Error('Order tidak bisa dibatalkan.');
  return setStatus(id, 'batal');
}

function logAudit({ eventType, userJid, userNumber, content }) {
  db.prepare('INSERT INTO audit_logs (event_type, user_jid, user_number, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(eventType, userJid || '', userNumber || '', content || '', now());
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value ?? fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

module.exports = {
  createOrder,
  getOrder,
  listOrders,
  listUserOrders,
  setStatus,
  setAdminNote,
  cancelOrder,
  logAudit,
  getSetting,
  setSetting,
};
