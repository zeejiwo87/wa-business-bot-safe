const config = require('../config');
const {
  isOwner,
} = require('../utils/format');


// ====================================================================
// 📋 MENU UTAMA
// ====================================================================

async function menu(ctx) {
  const prefix =
    config.prefix || '.';

  const botName =
    config.botName ||
    'Asistensi Tugas .ID';

  const owner =
    isOwner(
      ctx.msg
    );


  // ==================================================================
  // 👤 MENU CUSTOMER
  // ==================================================================

  if (!owner) {
    const text = `✨ *${botName}* ✨

Selamat datang di layanan *Asistensi Tugas .ID*.

*INFORMASI*
• ${prefix}payment — metode pembayaran

*INFORMASI LAINNYA*
• ${prefix}gempa — informasi gempa terbaru
• ${prefix}cuaca — informasi cuaca
• ${prefix}ping — cek respon bot

Untuk informasi produk premium, harga, ketersediaan, atau pemesanan, silakan hubungi admin.

Terima kasih telah menghubungi *Asistensi Tugas .ID*.`;

    await ctx.reply(
      text
    );

    return;
  }


  // ==================================================================
  // 👑 MENU OWNER
  // ==================================================================

  const text = `✨ *${botName}* ✨
👑 *OWNER MENU*

*AI CUSTOMER SERVICE*
• ${prefix}aion — aktifkan AI customer service
• ${prefix}aioff — nonaktifkan AI customer service
• ${prefix}aistatus — cek status AI

Harga dan paket AI mengikuti:
src/data/pricelist.txt

*AI MANUAL*
• ${prefix}balas <teks> — buat balasan WhatsApp
• ${prefix}maaf <masalah> — buat pesan permintaan maaf
• ${prefix}romantis <tema> — buat pesan romantis

Command AI manual tetap dapat digunakan meskipun ${prefix}aioff.

*PEMBAYARAN*
• ${prefix}payment — tampilkan metode pembayaran

*NO CALL*
• ${prefix}nocall on — aktifkan penolakan panggilan
• ${prefix}nocall off — nonaktifkan penolakan panggilan
• ${prefix}nocall — cek status No Call

*FITUR GRUP*
• ${prefix}grup on — aktifkan bot di grup ini
• ${prefix}grup off — nonaktifkan bot di grup ini
• ${prefix}grup status — cek status bot di grup

Saat ${prefix}grup off, bot tidak akan merespons pesan maupun command lain di grup tersebut.

*CUSTOM TEXT*
• ${prefix}addtext — tambah custom text
• ${prefix}deltext — hapus custom text

*UTILITAS*
• ${prefix}googleimage — pencarian gambar
• ${prefix}gempa — informasi gempa terbaru
• ${prefix}cuaca — informasi cuaca
• ${prefix}ping — cek respon bot
• ${prefix}me — cek profil pengguna

*LOG & PENYIMPANAN*
• ${prefix}setlog on — aktifkan audit log
• ${prefix}setlog off — nonaktifkan audit log
• ${prefix}reset stats — cek penggunaan penyimpanan
• ${prefix}reset logs confirm — hapus audit log
• ${prefix}reset uploads confirm — hapus file upload
• ${prefix}reset deliveries confirm — hapus file delivery

*DAFTAR COMMAND*
• ${prefix}command
• ${prefix}commands`;

  await ctx.reply(
    text
  );
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = menu;