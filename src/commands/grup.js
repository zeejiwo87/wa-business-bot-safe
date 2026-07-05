const db = require('../db');
const { isOwner, now } = require('../utils/format');

function isGroup(jid) {
  return jid.endsWith('@g.us');
}

async function grup(ctx) {
  if (!isGroup(ctx.from)) {
    return ctx.reply('Command ini hanya bisa dipakai di grup.');
  }

  if (!isOwner(ctx.msg) && !ctx.msg.key.fromMe) {
    return ctx.reply('Command ini khusus owner bot.');
  }

  const action = (ctx.args[0] || '').toLowerCase();

  if (!action || action === 'help') {
    return ctx.reply(`*FITUR GRUP*

• .grup on — aktifkan fitur di grup ini
• .grup off — matikan fitur di grup ini
• .grup status — cek status fitur

Fitur aktif:
• Jika owner ditag, bot akan membalas otomatis.
• Jika owner chat dan belum ada yang balas, bot akan mengingatkan setelah 5 menit.`);
  }

  if (action === 'on') {
    db.prepare(`
      INSERT INTO group_features (group_jid, enabled, created_at, updated_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(group_jid) DO UPDATE SET
        enabled = 1,
        updated_at = excluded.updated_at
    `).run(ctx.from, now(), now());

    return ctx.reply('✅ Fitur grup berhasil diaktifkan di grup ini.');
  }

  if (action === 'off') {
    db.prepare(`
      INSERT INTO group_features (group_jid, enabled, created_at, updated_at)
      VALUES (?, 0, ?, ?)
      ON CONFLICT(group_jid) DO UPDATE SET
        enabled = 0,
        updated_at = excluded.updated_at
    `).run(ctx.from, now(), now());

    return ctx.reply('✅ Fitur grup berhasil dimatikan di grup ini.');
  }

  if (action === 'status') {
    const row = db.prepare(`
      SELECT enabled FROM group_features WHERE group_jid = ?
    `).get(ctx.from);

    const status = row?.enabled ? 'AKTIF ✅' : 'NONAKTIF ❌';

    return ctx.reply(`Status fitur grup ini: *${status}*`);
  }

  return ctx.reply('Command tidak dikenal. Ketik *.grup help*');
}

module.exports = grup;