const { listOrders, getOrder, setStatus, setAdminNote, setSetting, getSetting } = require('../modules/orderService');
const { isOwner, jid, rupiah } = require('../utils/format');
const db = require('../db');

function ensureOwner(ctx) {
  if (!isOwner(ctx.msg)) {
    ctx.reply('Command ini khusus admin.');
    return false;
  }
  return true;
}

async function admin(ctx) {
  if (!ensureOwner(ctx)) return;
  const sub = (ctx.args[0] || '').toLowerCase();

  if (!sub || sub === 'help') {
    return ctx.reply(`*ADMIN COMMAND*\n\n.admin orders\n.admin order ORD-xxxx\n.admin status ORD-xxxx proses/selesai/batal/revisi\n.admin note ORD-xxxx catatan\n.admin stats`);
  }

  if (sub === 'orders') {
    const rows = listOrders(20);
    if (!rows.length) return ctx.reply('Belum ada order.');
    const list = rows.map((o) => `• *${o.id}* | ${o.status} | ${o.item_name} | ${o.user_number}`).join('\n');
    return ctx.reply(`📋 *20 ORDER TERBARU*\n\n${list}`);
  }

  if (sub === 'order') {
    const id = (ctx.args[1] || '').toUpperCase();
    const o = getOrder(id);
    if (!o) return ctx.reply('Order tidak ditemukan.');
    return ctx.reply(`🧾 *DETAIL ORDER*\n\nID: *${o.id}*\nUser: ${o.user_name || '-'} (${o.user_number})\nJenis: ${o.order_type}\nItem: ${o.item_name}\nPaket: ${o.variant || '-'}\nHarga: ${o.price ? rupiah(o.price) : '-'}\nStatus: *${o.status}*\nDetail: ${o.detail || '-'}\nCatatan: ${o.admin_note || '-'}`);
  }

  if (sub === 'status') {
    const id = (ctx.args[1] || '').toUpperCase();
    const status = (ctx.args[2] || '').toLowerCase();
    try {
      const o = setStatus(id, status);
      if (!o) return ctx.reply('Order tidak ditemukan.');
      await ctx.reply(`Status order *${id}* diubah menjadi *${status}*.`);
      await ctx.sock.sendMessage(jid(o.user_number), { text: `📦 *UPDATE ORDER*\n\nOrder ID: *${o.id}*\nItem: ${o.item_name}\nStatus sekarang: *${o.status.toUpperCase()}*\n\nKetik *.status ${o.id}* untuk detail.` });
      return;
    } catch (e) {
      return ctx.reply(e.message);
    }
  }

  if (sub === 'note') {
    const id = (ctx.args[1] || '').toUpperCase();
    const note = ctx.args.slice(2).join(' ').trim();
    if (!id || !note) return ctx.reply('Format: *.admin note ORD-xxxx catatan*');
    const o = setAdminNote(id, note);
    if (!o) return ctx.reply('Order tidak ditemukan.');
    await ctx.reply(`Catatan order *${id}* tersimpan.`);
    await ctx.sock.sendMessage(jid(o.user_number), { text: `📝 *CATATAN ADMIN*\n\nOrder ID: *${o.id}*\n${note}` });
    return;
  }

  if (sub === 'stats') {
    const total = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
    const pending = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='pending'").get().c;
    const proses = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='proses'").get().c;
    const selesai = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='selesai'").get().c;
    const log = getSetting('log_order_messages', 'on');
    return ctx.reply(`📊 *BOT STATS*\n\nTotal order: ${total}\nPending: ${pending}\nProses: ${proses}\nSelesai: ${selesai}\nOrder archive: ${log}`);
  }

  return ctx.reply('Subcommand admin tidak dikenal. Ketik *.admin help*');
}

async function setlog(ctx) {
  if (!ensureOwner(ctx)) return;
  const value = (ctx.args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(value)) return ctx.reply('Format: *.setlog on* atau *.setlog off*');
  setSetting('log_order_messages', value);
  return ctx.reply(`Order archive sekarang: *${value.toUpperCase()}*\n\nCatatan: arsip ini hanya untuk pesan/order yang dikirim ke bot, bukan bypass pesan pribadi.`);
}

module.exports = { admin, setlog };
