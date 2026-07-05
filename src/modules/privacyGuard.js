/**
 * Privacy Guard
 *
 * Modul ini sengaja tidak berisi bypass View Once atau replay pesan terhapus.
 * Untuk bot bisnis, simpan hanya data yang dikirim pelanggan ke bot/order dan
 * beri tahu pelanggan bahwa percakapan terkait transaksi bisa diarsipkan.
 */
function privacyNotice() {
  return 'Demi keamanan transaksi, pesan yang dikirim ke bot dapat diarsipkan sebagai bukti order. Bot tidak mengambil View Once atau pesan terhapus dari chat pribadi.';
}

module.exports = { privacyNotice };
