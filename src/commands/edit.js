const db = require('../db');
const config = require('../config');
const { isOwner, rupiah, now, getSenderNumber } = require('../utils/format');

const pendingEdits = new Map();

function sessionKey(msg) {
  return `${msg.key.remoteJid}:${getSenderNumber(msg)}`;
}

function cleanQuery(text) {
  return String(text || '').trim().toLowerCase();
}

function parsePrice(value) {
  const raw = String(value || '').trim().toLowerCase();

  if (!raw) {
    throw new Error('Harga tidak boleh kosong.');
  }

  if (raw === 'admin' || raw === 'hubungi admin' || raw === '-') {
    return null;
  }

  const number = Number(raw.replace(/[^\d]/g, ''));

  if (!number || Number.isNaN(number)) {
    throw new Error('Harga tidak valid. Contoh: 7000');
  }

  return number;
}

function formatPrice(price) {
  return price ? rupiah(price) : 'Hubungi admin';
}

function findProduct(query) {
  const q = `%${cleanQuery(query)}%`;

  return db
    .prepare('SELECT * FROM products WHERE lower(key) LIKE ? OR lower(name) LIKE ? LIMIT 1')
    .get(q, q);
}

function findService(query) {
  const q = `%${cleanQuery(query)}%`;

  return db
    .prepare('SELECT * FROM services WHERE lower(key) LIKE ? OR lower(name) LIKE ? LIMIT 1')
    .get(q, q);
}

function parseProductVariants(product) {
  return JSON.parse(product.variants_json || '[]');
}

function buildProductEditText(product, variants) {
  let text = `*EDIT HARGA ${product.name.toUpperCase()}*\n\n`;

  variants.forEach((v, index) => {
    text += `${index + 1}. ${v.name} — *${formatPrice(v.price)}*\n`;
  });

  text += `\nBalas dengan format:\n`;
  text += `*nomor harga_baru*\n\n`;
  text += `Contoh:\n`;
  text += `1 7000\n`;

  if (variants.length > 1) {
    text += `2 5000\n\n`;
    text += `Bisa edit banyak sekaligus:\n`;
    text += `1 7000\n2 5000\n`;
  }

  text += `\nKetik *batal* untuk membatalkan.`;

  return text;
}

function buildServiceEditText(service) {
  return `*EDIT HARGA ${service.name.toUpperCase()}*

Harga sekarang:
*${rupiah(service.min_price)} - ${rupiah(service.max_price)}*

Balas dengan format:
*harga_min harga_max*

Contoh:
120000 300000

Ketik *batal* untuk membatalkan.`;
}

async function edit(ctx) {
  if (!isOwner(ctx.msg)) {
    return ctx.reply('Command ini khusus admin.');
  }

  const sub = cleanQuery(ctx.args[0]);

  if (!sub || sub === 'help') {
    return ctx.reply(`*EDIT HARGA BOT*

Format:
${config.prefix}edit harga nama_produk

Contoh:
${config.prefix}edit harga canva
${config.prefix}edit harga chatgpt
${config.prefix}edit harga makalah

Kalau mau spesifik:
${config.prefix}edit harga premium canva
${config.prefix}edit harga jasa makalah`);
  }

  if (sub !== 'harga') {
    return ctx.reply(`Format salah.

Gunakan:
${config.prefix}edit harga canva`);
  }

  let mode = null;
  let queryParts = ctx.args.slice(1);

  const first = cleanQuery(queryParts[0]);

  if (['premium', 'produk', 'product'].includes(first)) {
    mode = 'product';
    queryParts = queryParts.slice(1);
  }

  if (['jasa', 'service', 'layanan'].includes(first)) {
    mode = 'service';
    queryParts = queryParts.slice(1);
  }

  const query = queryParts.join(' ').trim();

  if (!query) {
    return ctx.reply(`Nama produk/jasa belum diisi.

Contoh:
${config.prefix}edit harga canva
${config.prefix}edit harga jasa makalah`);
  }

  if (mode === 'product' || !mode) {
    const product = findProduct(query);

    if (product) {
      const variants = parseProductVariants(product);

      if (!variants.length) {
        return ctx.reply(`Produk *${product.name}* tidak punya paket harga.`);
      }

      pendingEdits.set(sessionKey(ctx.msg), {
        type: 'product',
        productId: product.id,
        productName: product.name,
        productKey: product.key,
        variants,
      });

      return ctx.reply(buildProductEditText(product, variants));
    }
  }

  if (mode === 'service' || !mode) {
    const service = findService(query);

    if (service) {
      pendingEdits.set(sessionKey(ctx.msg), {
        type: 'service',
        serviceId: service.id,
        serviceName: service.name,
        serviceKey: service.key,
      });

      return ctx.reply(buildServiceEditText(service));
    }
  }

  return ctx.reply(`Data *${query}* tidak ditemukan.

Coba cek:
${config.prefix}catalog
${config.prefix}jasa`);
}

async function handlePendingEdit(ctx) {
  if (!ctx.text) return false;

  const key = sessionKey(ctx.msg);
  const pending = pendingEdits.get(key);

  if (!pending) return false;

  if (ctx.text.startsWith(config.prefix)) {
    return false;
  }

  const input = ctx.text.trim();

  if (['batal', 'cancel', 'stop'].includes(input.toLowerCase())) {
    pendingEdits.delete(key);
    await ctx.reply('✅ Edit harga dibatalkan.');
    return true;
  }

  if (!isOwner(ctx.msg)) {
    return false;
  }

  if (pending.type === 'product') {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(pending.productId);

    if (!product) {
      pendingEdits.delete(key);
      await ctx.reply('Produk tidak ditemukan. Silakan ulangi dari awal.');
      return true;
    }

    const variants = parseProductVariants(product);
    const lines = input.split('\n').map((x) => x.trim()).filter(Boolean);

    try {
      if (variants.length === 1 && lines.length === 1 && !/^\d+[\.\)]?\s+/.test(lines[0])) {
        variants[0].price = parsePrice(lines[0]);
      } else {
        for (const line of lines) {
          const match = line.match(/^(\d+)[\.\)]?\s+(.+)$/);

          if (!match) {
            await ctx.reply(`Format salah.

Contoh:
1 7000

Atau:
1 7000
2 5000`);
            return true;
          }

          const index = Number(match[1]) - 1;
          const priceRaw = match[2];

          if (!variants[index]) {
            await ctx.reply(`Nomor paket ${index + 1} tidak ditemukan.`);
            return true;
          }

          variants[index].price = parsePrice(priceRaw);
        }
      }

      db.prepare('UPDATE products SET variants_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(variants), now(), product.id);

      pendingEdits.delete(key);

      let result = `✅ *Harga ${product.name} berhasil diubah.*\n\n`;

      variants.forEach((v, index) => {
        result += `${index + 1}. ${v.name} — *${formatPrice(v.price)}*\n`;
      });

      result += `\nCek dengan:\n${config.prefix}catalog ${product.key}`;

      await ctx.reply(result);
      return true;
    } catch (err) {
      await ctx.reply(err.message);
      return true;
    }
  }

  if (pending.type === 'service') {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(pending.serviceId);

    if (!service) {
      pendingEdits.delete(key);
      await ctx.reply('Jasa tidak ditemukan. Silakan ulangi dari awal.');
      return true;
    }

    const parts = input
      .replace(/-/g, ' ')
      .replace(/sampai/gi, ' ')
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length < 2) {
      await ctx.reply(`Format salah.

Contoh:
120000 300000`);
      return true;
    }

    try {
      const minPrice = parsePrice(parts[0]);
      const maxPrice = parsePrice(parts[1]);

      db.prepare('UPDATE services SET min_price = ?, max_price = ?, updated_at = ? WHERE id = ?')
        .run(minPrice, maxPrice, now(), service.id);

      pendingEdits.delete(key);

      await ctx.reply(`✅ *Harga ${service.name} berhasil diubah.*

Harga baru:
*${rupiah(minPrice)} - ${rupiah(maxPrice)}*

Cek dengan:
${config.prefix}jasa ${service.key}`);

      return true;
    } catch (err) {
      await ctx.reply(err.message);
      return true;
    }
  }

  return false;
}

module.exports = edit;
module.exports.handlePendingEdit = handlePendingEdit;