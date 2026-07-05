const db = require('../db');
const { rupiah } = require('../utils/format');

function parseProduct(row) {
  return {
    ...row,
    variants: JSON.parse(row.variants_json || '[]'),
    notes: JSON.parse(row.notes_json || '[]'),
  };
}

async function catalog(ctx) {
  const query = ctx.args.join(' ').trim().toLowerCase();
  if (!query) {
    const rows = db.prepare('SELECT key, name FROM products ORDER BY name ASC').all();
    const list = rows.map((p) => `┃𖥻 *${p.name}*`).join('\n');
    return ctx.reply(`✦ *PREMIUM APPS CATALOGUE* ✦\n\n${list}\n\nKetik *.catalog nama_produk* untuk detail.\nContoh: *.catalog canva*`);
  }

  const row = db.prepare('SELECT * FROM products WHERE lower(key) LIKE ? OR lower(name) LIKE ? LIMIT 1')
    .get(`%${query}%`, `%${query}%`);

  if (!row) return ctx.reply(`Produk *${query}* belum ada di katalog. Ketik *.catalog* untuk lihat daftar.`);
  const p = parseProduct(row);
  const variants = p.variants.map((v) => `▸ ${v.name} — *${v.price ? rupiah(v.price) : 'Hubungi admin'}*`).join('\n');
  const notes = p.notes.map((n) => `• ${n}`).join('\n');
  return ctx.reply(`◆ *${p.name}*\n${variants}\n${notes ? `\n${notes}` : ''}\n\nOrder: *.order premium | ${p.name} | nama paket | catatan/email*`);
}

module.exports = catalog;
