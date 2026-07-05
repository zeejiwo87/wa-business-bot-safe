const fs = require('fs');
const path = require('path');
const db = require('../db');
const { isOwner } = require('../utils/format');

const rootDir = path.join(__dirname, '..', '..');
const uploadsDir = path.join(rootDir, 'storage', 'uploads');
const deliveriesDir = path.join(rootDir, 'storage', 'deliveries');
const dbPath = path.join(rootDir, 'database.sqlite');

function humanSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getFileSize(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  } catch {
    return 0;
  }
}

function getFolderSize(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;

  let total = 0;
  for (const item of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      total += getFolderSize(fullPath);
    } else {
      total += stat.size;
    }
  }

  return total;
}

function emptyFolder(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return;
  }

  for (const item of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, item), { recursive: true, force: true });
  }
}

function optimizeDatabase() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
  } catch (err) {
    console.error('Optimize database error:', err);
  }
}

function getStats() {
  const orderCount = db.prepare('SELECT COUNT(*) AS total FROM orders').get().total;
  const logCount = db.prepare('SELECT COUNT(*) AS total FROM audit_logs').get().total;

  const sqliteSize =
    getFileSize(dbPath) +
    getFileSize(`${dbPath}-wal`) +
    getFileSize(`${dbPath}-shm`);

  return {
    orderCount,
    logCount,
    uploadsSize: getFolderSize(uploadsDir),
    deliveriesSize: getFolderSize(deliveriesDir),
    sqliteSize,
  };
}

async function reset(ctx) {
  if (!isOwner(ctx.msg)) {
    return ctx.reply('Command ini khusus owner bot.');
  }

  const target = (ctx.args[0] || '').toLowerCase();
  const confirm = (ctx.args[1] || '').toLowerCase();

  if (!target || target === 'help') {
    return ctx.reply(`*RESET PENYIMPANAN BOT*

Cek ukuran penyimpanan:
• .reset stats

Reset dengan konfirmasi:
• .reset logs confirm
• .reset uploads confirm
• .reset deliveries confirm
• .reset orders confirm
• .reset all confirm

Catatan:
• Tidak menghapus folder sessions, jadi bot tidak logout.
• Tidak menghapus storage/qris/qris.png.
• Gunakan .setlog off kalau tidak mau command dicatat ke audit_logs.`);
  }

  if (target === 'stats') {
    const s = getStats();
    return ctx.reply(`📦 *STORAGE BOT*

Database: ${humanSize(s.sqliteSize)}
Order tersimpan: ${s.orderCount}
Audit log: ${s.logCount}
Uploads: ${humanSize(s.uploadsSize)}
Deliveries: ${humanSize(s.deliveriesSize)}`);
  }

  const allowedTargets = ['logs', 'uploads', 'deliveries', 'orders', 'all'];
  if (!allowedTargets.includes(target)) {
    return ctx.reply('Target reset tidak dikenal. Ketik *.reset help*');
  }

  if (confirm !== 'confirm') {
    return ctx.reply(`⚠️ Ini akan menghapus data *${target}*.

Kalau yakin, ketik:
*.reset ${target} confirm*`);
  }

  if (target === 'logs') {
    db.prepare('DELETE FROM audit_logs').run();
    optimizeDatabase();
    return ctx.reply('✅ Audit log berhasil dikosongkan.');
  }

  if (target === 'uploads') {
    emptyFolder(uploadsDir);
    return ctx.reply('✅ Folder storage/uploads berhasil dikosongkan.');
  }

  if (target === 'deliveries') {
    emptyFolder(deliveriesDir);
    return ctx.reply('✅ Folder storage/deliveries berhasil dikosongkan.');
  }

  if (target === 'orders') {
    db.prepare('DELETE FROM orders').run();
    optimizeDatabase();
    return ctx.reply('✅ Semua order berhasil dihapus dari database.');
  }

  if (target === 'all') {
    db.prepare('DELETE FROM audit_logs').run();
    db.prepare('DELETE FROM orders').run();
    emptyFolder(uploadsDir);
    emptyFolder(deliveriesDir);
    optimizeDatabase();
    return ctx.reply('✅ Reset selesai. Logs, orders, uploads, dan deliveries sudah dikosongkan. Session WhatsApp dan QRIS tetap aman.');
  }
}

module.exports = reset;