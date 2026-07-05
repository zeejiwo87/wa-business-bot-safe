const db = require('../db');
const config = require('../config');
const { createOrder, getOrder, listUserOrders, cancelOrder } = require('../modules/orderService');
const { rupiah, getSenderNumber, jid } = require('../utils/format');

function findProduct(name) {
  return db.prepare('SELECT * FROM products WHERE lower(name) LIKE ? OR lower(key) LIKE ? LIMIT 1').get(`%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`);
}

function findService(name) {
  return db.prepare('SELECT * FROM services WHERE lower(name) LIKE ? OR lower(key) LIKE ? LIMIT 1').get(`%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`);
}

function parseVariants(row) {
  return JSON.parse(row.variants_json || '[]');
}

function closestVariant(variants, query) {
  if (!query) return variants[0];
  const q = query.toLowerCase();
  return variants.find((v) => v.name.toLowerCase().includes(q)) || variants[0];
}

async function order(ctx) {
  const raw = ctx.argsText.trim();
  if (!raw) {
    return ctx.reply(`Format order:\n\n*Premium:*\n.order premium | CANVA | 1 Tahun Member + Designer | email/catatan\n\n*Asistensi tugas:*\n.order jasa | Makalah | detail tugas + deadline`);
  }

  const parts = raw.split('|').map((x) => x.trim()).filter(Boolean);
  const type = (parts[0] || '').toLowerCase();
  const userNumber = getSenderNumber(ctx.msg);
  const userJid = ctx.from;
  const userName = ctx.msg.pushName || '';

  if (type === 'premium') {
    const productName = parts[1];
    const variantName = parts[2] || '';
    const detail = parts.slice(3).join(' | ');
    if (!productName) return ctx.reply('Nama produk harus diisi. Contoh: *.order premium | CANVA | 1 Tahun Member + Designer | email kamu*');

    const product = findProduct(productName);
    if (!product) return ctx.reply(`Produk *${productName}* tidak ditemukan. Ketik *.catalog* untuk daftar.`);
    const variants = parseVariants(product);
    const variant = closestVariant(variants, variantName);
    const orderData = createOrder({
      userJid,
      userNumber,
      userName,
      orderType: 'premium',
      itemKey: product.key,
      itemName: product.name,
      variant: variant?.name || variantName,
      price: variant?.price ?? null,
      detail,
    });

    await ctx.reply(`🧾 *ORDER BERHASIL DIBUAT*\n\nOrder ID: *${orderData.id}*\nProduk: *${orderData.item_name}*\nPaket: ${orderData.variant || '-'}\nHarga: *${orderData.price ? rupiah(orderData.price) : 'Hubungi admin'}*\nStatus: *PENDING*\n\nKetik *.payment* untuk metode pembayaran.\nKetik *.status ${orderData.id}* untuk cek status.`);
    await ctx.notifyOwner(`📥 *ORDER BARU*\n\nID: *${orderData.id}*\nUser: ${userName || userNumber}\nJenis: Premium\nProduk: ${orderData.item_name}\nPaket: ${orderData.variant || '-'}\nHarga: ${orderData.price ? rupiah(orderData.price) : '-'}\nDetail: ${detail || '-'}`);
    return;
  }

  if (type === 'jasa' || type === 'tugas' || type === 'asistensi') {
    const serviceName = parts[1];
    const detail = parts.slice(2).join(' | ');
    if (!serviceName || !detail) return ctx.reply('Format: *.order jasa | Makalah | detail tugas + deadline*');
    const service = findService(serviceName);
    if (!service) return ctx.reply(`Layanan *${serviceName}* tidak ditemukan. Ketik *.jasa* untuk daftar.`);

    const orderData = createOrder({
      userJid,
      userNumber,
      userName,
      orderType: 'jasa',
      itemKey: service.key,
      itemName: service.name,
      variant: service.unit,
      price: null,
      detail,
    });

    await ctx.reply(`🧾 *ORDER ASISTENSI BERHASIL DIBUAT*\n\nOrder ID: *${orderData.id}*\nLayanan: *${orderData.item_name}*\nEstimasi harga: chat admin setelah konsultasi\nStatus: *PENDING*\n\nAdmin akan cek detail dan konfirmasi harga.\nKetik *.status ${orderData.id}* untuk cek status.`);
    await ctx.notifyOwner(`📚 *ORDER ASISTENSI BARU*\n\nID: *${orderData.id}*\nUser: ${userName || userNumber}\nLayanan: ${orderData.item_name}\nDetail: ${detail}`);
    return;
  }

  return ctx.reply('Jenis order tidak valid. Pakai *premium* atau *jasa*.');
}

async function status(ctx) {
  const id = (ctx.args[0] || '').toUpperCase();
  if (!id) {
    const rows = listUserOrders(getSenderNumber(ctx.msg));
    if (!rows.length) return ctx.reply('Kamu belum punya order.');
    const list = rows.map((o) => `• *${o.id}* — ${o.item_name} — ${o.status}`).join('\n');
    return ctx.reply(`📦 *ORDER KAMU*\n\n${list}`);
  }
  const o = getOrder(id);
  if (!o) return ctx.reply(`Order *${id}* tidak ditemukan.`);
  const sender = getSenderNumber(ctx.msg);
  if (o.user_number !== sender && sender !== config.ownerNumber) return ctx.reply('Order ini bukan milik nomor kamu.');
  return ctx.reply(`📦 *STATUS ORDER*\n\nID: *${o.id}*\nJenis: ${o.order_type}\nItem: *${o.item_name}*\nPaket: ${o.variant || '-'}\nHarga: ${o.price ? rupiah(o.price) : '-'}\nStatus: *${o.status.toUpperCase()}*\nCatatan admin: ${o.admin_note || '-'}\nDetail: ${o.detail || '-'}`);
}

async function cancel(ctx) {
  const id = (ctx.args[0] || '').toUpperCase();
  if (!id) return ctx.reply('Format: *.cancel ORD-xxxx*');
  try {
    const o = cancelOrder(id, getSenderNumber(ctx.msg));
    if (!o) return ctx.reply(`Order *${id}* tidak ditemukan.`);
    await ctx.reply(`Order *${id}* berhasil dibatalkan.`);
    await ctx.notifyOwner(`⚠️ Order dibatalkan user: *${id}*`);
  } catch (e) {
    return ctx.reply(e.message);
  }
}

module.exports = { order, status, cancel };
