const db = require('../db');
const config = require('../config');

const {
  isOwner,
  now,
} = require('../utils/format');


// ====================================================================
// 👥 CEK JID GRUP
// ====================================================================

function isGroup(jidValue) {
  return String(
    jidValue || ''
  ).endsWith('@g.us');
}


// ====================================================================
// 👥 AMBIL STATUS FITUR GRUP
// ====================================================================

function getGroupFeatureStatus(
  groupJid
) {
  try {
    const row =
      db.prepare(`
        SELECT enabled
        FROM group_features
        WHERE group_jid = ?
        LIMIT 1
      `).get(
        groupJid
      );

    return Number(
      row?.enabled
    ) === 1;

  } catch (err) {
    console.error(
      '[GROUP STATUS ERROR]',
      err
    );

    return false;
  }
}


// ====================================================================
// 💾 SIMPAN STATUS FITUR GRUP
// ====================================================================

function setGroupFeatureStatus(
  groupJid,
  enabled
) {
  const timestamp =
    now();


  db.prepare(`
    INSERT INTO group_features (
      group_jid,
      enabled,
      created_at,
      updated_at
    )

    VALUES (?, ?, ?, ?)

    ON CONFLICT(group_jid)
    DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run(
    groupJid,
    enabled ? 1 : 0,
    timestamp,
    timestamp
  );
}


// ====================================================================
// 👥 COMMAND GRUP
//
// .grup on
// .grup off
// .grup status
//
// Alias:
// .group ...
// ====================================================================

async function grup(ctx) {
  const prefix =
    config.prefix || '.';


  // ==================================================================
  // COMMAND HANYA BERLAKU DI GRUP
  // ==================================================================

  if (
    !isGroup(
      ctx.from
    )
  ) {
    return ctx.reply(
      'Command ini hanya dapat digunakan di grup.'
    );
  }


  // ==================================================================
  // KHUSUS OWNER / PESAN BOT SENDIRI
  //
  // Non-owner dibuat diam agar tidak memicu percakapan bot.
  // ==================================================================

  if (
    !isOwner(
      ctx.msg
    ) &&
    !ctx.msg?.key?.fromMe
  ) {
    return;
  }


  const action =
    String(
      ctx.args?.[0] || ''
    )
      .trim()
      .toLowerCase();


  // ==================================================================
  // HELP
  // ==================================================================

  if (
    !action ||
    action === 'help'
  ) {
    return ctx.reply(
`👥 *FITUR GRUP*

• ${prefix}grup on — aktifkan fitur bot di grup ini
• ${prefix}grup off — nonaktifkan fitur bot di grup ini
• ${prefix}grup status — cek status fitur grup

*Saat fitur aktif:*
• Bot dapat merespons command di grup.
• Bot dapat merespons ketika owner/bot ditandai.
• Reminder grup dapat berjalan sesuai konfigurasi.

*Saat fitur nonaktif:*
• Bot tidak merespons menu.
• Bot tidak merespons command biasa.
• AI tidak merespons.
• Command No Call tidak diproses dari grup.
• Owner tetap dapat menggunakan ${prefix}grup on untuk mengaktifkannya kembali.`
    );
  }


  // ==================================================================
  // ✅ GRUP ON
  // ==================================================================

  if (
    action === 'on'
  ) {
    try {
      setGroupFeatureStatus(
        ctx.from,
        true
      );


      return ctx.reply(
`✅ *FITUR GRUP AKTIF*

Bot sekarang dapat merespons fitur dan command di grup ini.

Untuk menonaktifkan:
${prefix}grup off`
      );

    } catch (err) {
      console.error(
        '[GROUP ON ERROR]',
        err
      );


      return ctx.reply(
        '❌ Gagal mengaktifkan fitur grup.'
      );
    }
  }


  // ==================================================================
  // ⛔ GRUP OFF
  // ==================================================================

  if (
    action === 'off'
  ) {
    try {
      setGroupFeatureStatus(
        ctx.from,
        false
      );


      return ctx.reply(
`⛔ *FITUR GRUP NONAKTIF*

Bot tidak akan merespons command maupun fitur otomatis di grup ini.

Owner tetap dapat mengaktifkannya kembali dengan:
${prefix}grup on`
      );

    } catch (err) {
      console.error(
        '[GROUP OFF ERROR]',
        err
      );


      return ctx.reply(
        '❌ Gagal menonaktifkan fitur grup.'
      );
    }
  }


  // ==================================================================
  // 📊 STATUS
  // ==================================================================

  if (
    action === 'status'
  ) {
    const enabled =
      getGroupFeatureStatus(
        ctx.from
      );


    return ctx.reply(
      enabled
        ? `👥 Fitur grup: *AKTIF* ✅\n\nGunakan ${prefix}grup off untuk menonaktifkan.`
        : `👥 Fitur grup: *NONAKTIF* ⛔\n\nGunakan ${prefix}grup on untuk mengaktifkan.`
    );
  }


  // ==================================================================
  // COMMAND TIDAK DIKENAL
  // ==================================================================

  return ctx.reply(
`❌ Perintah tidak dikenal.

Gunakan:
• ${prefix}grup on
• ${prefix}grup off
• ${prefix}grup status
• ${prefix}grup help`
  );
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = grup;