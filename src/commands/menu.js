const config = require('../config');

async function menu(ctx) {
  const text = `✨ *${config.botName}* ✨

*MENU CUSTOMER*
• ${config.prefix}catalog — daftar aplikasi premium
• ${config.prefix}catalog canva — detail produk
• ${config.prefix}jasa — daftar layanan asistensi tugas
• ${config.prefix}jasa makalah — detail layanan
• ${config.prefix}order premium | CANVA | 1 Tahun Member + Designer | email kamu
• ${config.prefix}order jasa | Makalah | detail tugas + deadline
• ${config.prefix}payment — metode pembayaran
• ${config.prefix}status ORD-xxxx — cek status order
• ${config.prefix}cancel ORD-xxxx — batalkan order

*MENU ADMIN*
• ${config.prefix}admin orders
• ${config.prefix}admin order ORD-xxxx
• ${config.prefix}admin status ORD-xxxx proses/selesai/batal/revisi
• ${config.prefix}admin note ORD-xxxx catatan
• ${config.prefix}admin stats
• ${config.prefix}setlog on/off

*MENU PENYIMPANAN*
• ${config.prefix}reset stats — cek penyimpanan bot
• ${config.prefix}reset logs confirm — hapus audit log
• ${config.prefix}reset uploads confirm — hapus file upload
• ${config.prefix}reset deliveries confirm — hapus file delivery
• ${config.prefix}reset orders confirm — hapus semua order
• ${config.prefix}reset all confirm — reset data bot

*MENU EDIT HARGA*
• ${config.prefix}edit harga canva — edit harga produk
• ${config.prefix}edit harga netflix — edit harga produk lain
• ${config.prefix}edit harga jasa makalah — edit harga jasa

*MENU GRUP*
• ${config.prefix}grup on — aktifkan fitur otomatis di grup ini
• ${config.prefix}grup off — matikan fitur otomatis di grup ini
• ${config.prefix}grup status — cek status fitur grup

Catatan:
• Fitur reset tidak menghapus session WhatsApp.
• Bot tidak akan logout selama folder sessions tidak dihapus.
• Fitur grup hanya aktif di grup yang kamu nyalakan dengan ${config.prefix}grup on.
• Layanan asistensi tugas diarahkan untuk konsultasi, proofreading, formatting, desain, dan pendampingan.`;

  await ctx.reply(text);
}

module.exports = menu;