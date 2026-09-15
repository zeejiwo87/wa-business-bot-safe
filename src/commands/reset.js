const fs = require('fs');
const path = require('path');

const db = require('../db');

const {
  isOwner,
} = require('../utils/format');


// ====================================================================
// 📁 PATH PROJECT
// ====================================================================

const rootDir =
  path.join(
    __dirname,
    '..',
    '..'
  );


const uploadsDir =
  path.join(
    rootDir,
    'storage',
    'uploads'
  );


const deliveriesDir =
  path.join(
    rootDir,
    'storage',
    'deliveries'
  );


const antideleteDir =
  path.join(
    rootDir,
    'storage',
    'antidelete-cache'
  );


const dbPath =
  path.join(
    rootDir,
    'database.sqlite'
  );


const pricelistPath =
  path.join(
    rootDir,
    'src',
    'data',
    'pricelist.txt'
  );


// ====================================================================
// 📦 FORMAT UKURAN FILE
// ====================================================================

function humanSize(bytes) {
  const value =
    Number(
      bytes
    ) || 0;


  if (value <= 0) {
    return '0 B';
  }


  const units = [
    'B',
    'KB',
    'MB',
    'GB',
    'TB',
  ];


  let size =
    value;


  let unitIndex =
    0;


  while (
    size >= 1024 &&
    unitIndex <
      units.length - 1
  ) {
    size /= 1024;

    unitIndex += 1;
  }


  const digits =
    (
      size >= 10 ||
      unitIndex === 0
    )
      ? 0
      : 1;


  return (
    `${size.toFixed(digits)} ` +
    units[unitIndex]
  );
}


// ====================================================================
// 📄 UKURAN FILE
// ====================================================================

function getFileSize(filePath) {
  try {
    if (
      !fs.existsSync(
        filePath
      )
    ) {
      return 0;
    }


    const stat =
      fs.statSync(
        filePath
      );


    if (
      !stat.isFile()
    ) {
      return 0;
    }


    return stat.size;

  } catch {
    return 0;
  }
}


// ====================================================================
// 📁 UKURAN FOLDER
// ====================================================================

function getFolderSize(dirPath) {
  if (
    !fs.existsSync(
      dirPath
    )
  ) {
    return 0;
  }


  let total =
    0;


  try {
    const items =
      fs.readdirSync(
        dirPath
      );


    for (
      const item
      of items
    ) {
      const fullPath =
        path.join(
          dirPath,
          item
        );


      try {
        const stat =
          fs.lstatSync(
            fullPath
          );


        if (
          stat.isDirectory()
        ) {
          total +=
            getFolderSize(
              fullPath
            );

        } else if (
          stat.isFile()
        ) {
          total +=
            stat.size;
        }

      } catch {
        // File bisa saja sedang dibuat/dihapus.
        // Aman untuk dilewati.
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
  try {
    if (
      !fs.existsSync(
        dirPath
      )
    ) {
      fs.mkdirSync(
        dirPath,
        {
          recursive: true,
        }
      );

      return;
    }


    const items =
      fs.readdirSync(
        dirPath
      );


    for (
      const item
      of items
    ) {
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

  } catch (err) {
    throw new Error(
      `Gagal membersihkan folder: ${err.message}`
    );
  }
}


// ====================================================================
// 🗃️ CEK APAKAH TABLE ADA
// ====================================================================

function tableExists(
  tableName
) {
  try {
    const row =
      db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
        LIMIT 1
      `).get(
        tableName
      );


    return Boolean(
      row
    );

  } catch {
    return false;
  }
}


// ====================================================================
// 🔢 HITUNG DATA TABLE DENGAN AMAN
// ====================================================================

function safeCountTable(
  tableName
) {
  try {
    if (
      !tableExists(
        tableName
      )
    ) {
      return 0;
    }


    // Nama tabel hanya berasal dari kode internal,
    // bukan dari input user.
    const row =
      db.prepare(`
        SELECT COUNT(*) AS total
        FROM ${tableName}
      `).get();


    return Number(
      row?.total
    ) || 0;

  } catch {
    return 0;
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

    return true;

  } catch (err) {
    console.error(
      '[RESET] Optimize database error:',
      err
    );

    return false;
  }
}


// ====================================================================
// 📊 AMBIL STATISTIK PENYIMPANAN
// ====================================================================

function getStats() {
  const logCount =
    safeCountTable(
      'audit_logs'
    );


  const welcomeCount =
    safeCountTable(
      'private_welcome_logs'
    );


  const groupSettingCount =
    safeCountTable(
      'group_features'
    );


  const sqliteSize =
    getFileSize(
      dbPath
    ) +
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


  const pricelistSize =
    getFileSize(
      pricelistPath
    );


  return {
    logCount,
    welcomeCount,
    groupSettingCount,

    sqliteSize,

    uploadsSize,
    deliveriesSize,
    antideleteSize,
    pricelistSize,

    totalSize:
      sqliteSize +
      uploadsSize +
      deliveriesSize +
      antideleteSize +
      pricelistSize,
  };
}


// ====================================================================
// 📝 HAPUS AUDIT LOG
// ====================================================================

function clearAuditLogs() {
  if (
    !tableExists(
      'audit_logs'
    )
  ) {
    return 0;
  }


  const result =
    db.prepare(`
      DELETE FROM audit_logs
    `).run();


  return Number(
    result.changes
  ) || 0;
}


// ====================================================================
// ♻️ COMMAND RESET
// ====================================================================

async function reset(ctx) {

  // ==================================================================
  // 👑 KHUSUS OWNER
  // ==================================================================

  if (
    !isOwner(
      ctx.msg
    )
  ) {
    return ctx.reply(
      'Command ini hanya dapat digunakan oleh owner.'
    );
  }


  const target =
    String(
      ctx.args?.[0] || ''
    )
      .trim()
      .toLowerCase();


  const confirm =
    String(
      ctx.args?.[1] || ''
    )
      .trim()
      .toLowerCase();


  // ==================================================================
  // 📖 HELP
  // ==================================================================

  if (
    !target ||
    target === 'help'
  ) {
    return ctx.reply(
`🧹 *PENGELOLAAN PENYIMPANAN BOT*

*Cek penyimpanan:*
• .reset stats

*Pembersihan data:*
• .reset logs confirm
• .reset uploads confirm
• .reset deliveries confirm
• .reset antidelete confirm

*Informasi:*
• Session WhatsApp tidak akan dihapus.
• Bot tidak akan logout.
• QRIS tidak akan dihapus.
• Pricelist tidak akan dihapus.
• Riwayat nomor yang sudah menerima welcome tidak akan dihapus.
• Pengaturan AI tidak akan dihapus.
• Pengaturan grup tidak akan dihapus.
• Cache anti-delete dapat dibersihkan secara manual dengan *.reset antidelete confirm*.

Gunakan *.setlog off* apabila audit command tidak ingin disimpan.`
    );
  }


  // ==================================================================
  // 📊 STATS
  // ==================================================================

  if (
    target === 'stats'
  ) {
    const stats =
      getStats();


    const pricelistStatus =
      fs.existsSync(
        pricelistPath
      )
        ? '✅ Tersedia'
        : '❌ Tidak ditemukan';


    return ctx.reply(
`📦 *STORAGE BOT*

🗃️ Database:
${humanSize(stats.sqliteSize)}

📝 Audit log:
${stats.logCount} data

👋 Nomor pernah menerima welcome:
${stats.welcomeCount}

👥 Pengaturan grup:
${stats.groupSettingCount}

📁 Uploads:
${humanSize(stats.uploadsSize)}

📦 Deliveries:
${humanSize(stats.deliveriesSize)}

🛡️ Cache Anti-Delete:
${humanSize(stats.antideleteSize)}

💰 Pricelist:
${pricelistStatus}
${humanSize(stats.pricelistSize)}

━━━━━━━━━━━━━━━

💾 Total data terhitung:
*${humanSize(stats.totalSize)}*`
    );
  }


  // ==================================================================
  // ✅ DAFTAR TARGET YANG BOLEH DIRESET
  // ==================================================================

  const allowedTargets = [
    'logs',
    'uploads',
    'deliveries',
    'antidelete',
  ];


  if (
    !allowedTargets.includes(
      target
    )
  ) {
    return ctx.reply(
`❌ Target reset tidak dikenal.

Gunakan:
*.reset help*`
    );
  }


  // ==================================================================
  // ⚠️ KONFIRMASI
  // ==================================================================

  if (
    confirm !== 'confirm'
  ) {
    return ctx.reply(
`⚠️ Anda akan membersihkan data *${target}*.

Jika yakin, ketik:

*.reset ${target} confirm*`
    );
  }


  // ==================================================================
  // 📝 RESET AUDIT LOG
  // ==================================================================

  if (
    target === 'logs'
  ) {
    try {
      const deleted =
        clearAuditLogs();


      optimizeDatabase();


      return ctx.reply(
`✅ *AUDIT LOG DIBERSIHKAN*

${deleted} data audit berhasil dihapus.

Data lain tetap aman.`
      );

    } catch (err) {
      console.error(
        '[RESET LOG ERROR]',
        err
      );


      return ctx.reply(
        '❌ Gagal membersihkan audit log.'
      );
    }
  }


  // ==================================================================
  // 📁 RESET UPLOADS
  // ==================================================================

  if (
    target === 'uploads'
  ) {
    try {
      const beforeSize =
        getFolderSize(
          uploadsDir
        );


      emptyFolder(
        uploadsDir
      );


      return ctx.reply(
`✅ *UPLOADS DIBERSIHKAN*

Data yang dibersihkan:
${humanSize(beforeSize)}

Folder *storage/uploads* sekarang kosong.`
      );

    } catch (err) {
      console.error(
        '[RESET UPLOADS ERROR]',
        err
      );


      return ctx.reply(
        '❌ Gagal membersihkan folder uploads.'
      );
    }
  }


  // ==================================================================
  // 📦 RESET DELIVERIES
  // ==================================================================

  if (
    target === 'deliveries'
  ) {
    try {
      const beforeSize =
        getFolderSize(
          deliveriesDir
        );


      emptyFolder(
        deliveriesDir
      );


      return ctx.reply(
`✅ *DELIVERIES DIBERSIHKAN*

Data yang dibersihkan:
${humanSize(beforeSize)}

Folder *storage/deliveries* sekarang kosong.`
      );

    } catch (err) {
      console.error(
        '[RESET DELIVERIES ERROR]',
        err
      );


      return ctx.reply(
        '❌ Gagal membersihkan folder deliveries.'
      );
    }
  }


  // ==================================================================
  // 🛡️ RESET CACHE ANTI-DELETE
  // ==================================================================

  if (
    target === 'antidelete'
  ) {
    try {
      const beforeSize =
        getFolderSize(
          antideleteDir
        );


      emptyFolder(
        antideleteDir
      );


      return ctx.reply(
`✅ *CACHE ANTI-DELETE DIBERSIHKAN*

Data yang dibersihkan:
${humanSize(beforeSize)}

Pesan/media baru setelah ini tetap dapat masuk ke cache sesuai konfigurasi anti-delete.`
      );

    } catch (err) {
      console.error(
        '[RESET ANTIDELETE ERROR]',
        err
      );


      return ctx.reply(
        '❌ Gagal membersihkan cache anti-delete.'
      );
    }
  }
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = reset;