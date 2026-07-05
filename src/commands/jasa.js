const db = require('../db');
const { rupiah } = require('../utils/format');

function parseService(row) {
  return { ...row, notes: JSON.parse(row.notes_json || '[]') };
}

async function jasa(ctx) {
  const query = ctx.args.join(' ').trim().toLowerCase();
  if (!query) {
    const rows = db.prepare('SELECT * FROM services ORDER BY id ASC').all().map(parseService);
    const list = rows.map((s) => `• ${s.emoji} *${s.name}*: ${rupiah(s.min_price)} – ${rupiah(s.max_price)}${s.unit === 'halaman' ? '/hal' : ''}`).join('\n');
    return ctx.reply(`📚 *DAFTAR HARGA ASISTENSI TUGAS* 🔥\n\n${list}\n\n💬 Konsultasi gratis dulu. Nego bisa.\n\nKetik *.jasa makalah* untuk detail.\nOrder: *.order jasa | Makalah | detail tugas + deadline*`);
  }

  const row = db.prepare('SELECT * FROM services WHERE lower(key) LIKE ? OR lower(name) LIKE ? LIMIT 1')
    .get(`%${query}%`, `%${query}%`);
  if (!row) return ctx.reply(`Layanan *${query}* belum ada. Ketik *.jasa* untuk daftar.`);
  const s = parseService(row);
  const notes = s.notes.map((n) => `• ${n}`).join('\n');
  return ctx.reply(`${s.emoji} *${s.name.toUpperCase()}*\n\nHarga: *${rupiah(s.min_price)} – ${rupiah(s.max_price)}*${s.unit === 'halaman' ? ' / halaman' : ''}\n${notes ? `\n${notes}` : ''}\n\nOrder: *.order jasa | ${s.name} | detail tugas + deadline*`);
}

module.exports = jasa;
