const fs = require('fs');
const path = require('path');
const db = require('../db');
const { isOwner } = require('../utils/format');

const rootDir = path.join(__dirname, '..', '..');

const uploadsDir = path.join(
  rootDir,
  'storage',
  'uploads'
);

const deliveriesDir = path.join(
  rootDir,
  'storage',
  'deliveries'
);

const antideleteDir = path.join(
  rootDir,
  'storage',
  'antidelete-cache'
);

const dbPath = path.join(
  rootDir,
  'database.sqlite'
);


// ====================================================================
// 📦 FORMAT UKURAN FILE
// ====================================================================

function humanSize(bytes) {
  if (!bytes) {
    return '0 B';
  }

  const units = [
    'B',
    'KB',
    'MB',
    'GB',
    'TB',
  ];

  let size = bytes;
  let unitIndex = 0;

  while (
    size >= 1024 &&
    unitIndex < units.length - 1
  ) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(
    size >= 10 || unitIndex === 0
      ? 0
      : 1
  )} ${units[unitIndex]}`;
}


// ====================================================================
// 📄 UKURAN FILE
// ====================================================================

function getFileSize(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return 0;
    }

    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}


// ====================================================================
// 📁 UKURAN FOLDER
// ====================================================================

function getFolderSize(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  let total = 0;

  try {
    const items =
      fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath =
        path.join(
          dirPath,
          item
        );

      try {
        const stat =
          fs.statSync(fullPath);

        if (stat.isDirectory()) {
          total +=
            getFolderSize(
              fullPath
            );
        } else {
          total += stat.size;
        }
      } catch {
        // File mungkin sedang dihapus/dibuat,
        // aman untuk dilewati.
      }
    }
  } catch {
    return 0;
  }

  return total;
}


// ====================================================================
// 🧹 KOSONGKAN FOLDER
// ====================================================================

function emptyFolder(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(
      dirPath,
      {
        recursive: true,
      }
    );

    return;
  }

  const items =
    fs.readdirSync(dirPath);

  for (const item of items) {
    fs.rmSync(
      path.join(
        dirPath,
        item
      ),
      {
        recursive: true,
        force: true,
      }
    );
  }
}


// ====================================================================
// 🗃️ OPTIMASI SQLITE
// ====================================================================

function optimizeDatabase() {
  try {
    db.pragma(
      'wal_checkpoint(TRUNCATE)'
    );

    db.exec(
      'VACUUM'
    );
  } catch (err) {
    console.error(
      '[RESET] Optimize database error:',
      err
    );
  }
}


// ====================================================================
// 📊 AMBIL STATISTIK PENYIMPANAN
// ====================================================================

function getStats() {
  const orderCount =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM orders
    `).get().total;

  const logCount =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM audit_logs
    `).get().total;


  const sqliteSize =
    getFileSize(dbPath) +
    getFileSize(
      `${dbPath}-wal`
    ) +
    getFileSize(
      `${dbPath}-shm`
    );


  const uploadsSize =
    getFolderSize(
      uploadsDir
    );


  const deliveriesSize =
    getFolderSize(
      deliveriesDir
    );


  const antideleteSize =
    getFolderSize(
      antideleteDir
    );


  return {
    orderCount,
    logCount,

    uploadsSize,
    deliveriesSize,
    antideleteSize,

    sqliteSize,

    totalSize:
      sqliteSize +
      uploadsSize +
      deliveriesSize +
      antideleteSize,
  };
}


// ====================================================================
// ♻️ COMMAND RESET
// ====================================================================

async function reset(ctx) {
  // ==================================================================
  // KHUSUS OWNER
  // ==================================================================

  if (!isOwner(ctx.msg)) {
    return ctx.reply(
      'Command ini khusus owner bot.'
    );
  }


  const target =
    String(
      ctx.args[0] || ''
    ).toLowerCase();


  const confirm =
    String(
      ctx.args[1] || ''
    ).toLowerCase();


  // ==================================================================
  // HELP
  // ==================================================================

  if (
    !target ||
    target === 'help'
  ) {
    return ctx.reply(`*RESET PENYIMPANAN BOT*

*Cek penyimpanan:*
• .reset stats

*Reset dengan konfirmasi:*
• .reset logs confirm
• .reset uploads confirm
• .reset deliveries confirm
• .reset antidelete confirm
• .reset orders confirm
• .reset all confirm

*Catatan:*
• Tidak menghapus folder sessions
• Bot tidak akan logout
• Tidak menghapus storage/qris/qris.png
• Cache anti-delete otomatis terhapus maksimal setelah 24 jam
• .reset antidelete digunakan jika ingin membersihkan cache media lebih cepat
• Gunakan .setlog off jika tidak ingin command dicatat ke audit log`);
  }


  // ==================================================================
  // 📊 STATS
  // ==================================================================

  if (target === 'stats') {
    const s =
      getStats();

    return ctx.reply(`📦 *STORAGE BOT*

🗃️ Database: ${humanSize(s.sqliteSize)}
📋 Order tersimpan: ${s.orderCount}
📝 Audit log: ${s.logCount}

📁 Uploads: ${humanSize(s.uploadsSize)}
📦 Deliveries: ${humanSize(s.deliveriesSize)}
🛡️ Cache Anti-Delete: ${humanSize(s.antideleteSize)}

━━━━━━━━━━━━━━━
💾 Total data terhitung:
*${humanSize(s.totalSize)}*`);
  }


  // ==================================================================
  // DAFTAR TARGET YANG BOLEH DIRESET
  // ==================================================================

  const allowedTargets = [
    'logs',
    'uploads',
    'deliveries',
    'antidelete',
    'orders',
    'all',
  ];


  if (
    !allowedTargets.includes(
      target
    )
  ) {
    return ctx.reply(
      'Target reset tidak dikenal. Ketik *.reset help*'
    );
  }


  // ==================================================================
  // KONFIRMASI
  // ==================================================================

  if (confirm !== 'confirm') {
    return ctx.reply(`⚠️ Ini akan menghapus data *${target}*.

Kalau yakin, ketik:
*.reset ${target} confirm*`);
  }


  // ==================================================================
  // 📝 RESET LOG
  // ==================================================================

  if (target === 'logs') {
    db.prepare(`
      DELETE FROM audit_logs
    `).run();

    optimizeDatabase();

    return ctx.reply(
      '✅ Audit log berhasil dikosongkan.'
    );
  }


  // ==================================================================
  // 📁 RESET UPLOADS
  // ==================================================================

  if (target === 'uploads') {
    emptyFolder(
      uploadsDir
    );

    return ctx.reply(
      '✅ Folder storage/uploads berhasil dikosongkan.'
    );
  }


  // ==================================================================
  // 📦 RESET DELIVERIES
  // ==================================================================

  if (
    target === 'deliveries'
  ) {
    emptyFolder(
      deliveriesDir
    );

    return ctx.reply(
      '✅ Folder storage/deliveries berhasil dikosongkan.'
    );
  }


  // ==================================================================
  // 🛡️ RESET CACHE ANTI-DELETE
  // ==================================================================

  if (
    target === 'antidelete'
  ) {
    emptyFolder(
      antideleteDir
    );

    return ctx.reply(`✅ Cache media anti-delete berhasil dikosongkan.

Pesan baru setelah ini tetap akan masuk ke cache seperti biasa.`);
  }


  // ==================================================================
  // 📋 RESET ORDERS
  // ==================================================================

  if (target === 'orders') {
    db.prepare(`
      DELETE FROM orders
    `).run();

    optimizeDatabase();

    return ctx.reply(
      '✅ Semua order berhasil dihapus dari database.'
    );
  }


  // ==================================================================
  // ☢️ RESET ALL
  // ==================================================================

  if (target === 'all') {
    db.prepare(`
      DELETE FROM audit_logs
    `).run();


    db.prepare(`
      DELETE FROM orders
    `).run();


    emptyFolder(
      uploadsDir
    );


    emptyFolder(
      deliveriesDir
    );


    emptyFolder(
      antideleteDir
    );


    optimizeDatabase();


    return ctx.reply(`✅ *Reset selesai.*

Data yang dikosongkan:
• Audit logs
• Orders
• Uploads
• Deliveries
• Cache anti-delete

Data yang tetap aman:
• Session WhatsApp
• QRIS
• Produk
• Jasa
• Konfigurasi bot`);
  }
}

module.exports = reset;