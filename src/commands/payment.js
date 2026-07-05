const fs = require('fs');
const path = require('path');
const config = require('../config');

async function payment(ctx) {
  const text = `💳 *PAYMENT METHOD*\n\n📱 *GOPAY*\n${config.payment.gopayNumber}\nA/N ${config.payment.gopayName}\n\n📲 *QRIS*\nTersedia, scan QRIS dari admin.\n\n━━━━━━━━━━━━━━━\n⚠️ Catatan:\n• Mohon kirim bukti pembayaran\n• Order diproses setelah pembayaran valid\n• No spam, cukup kirim bukti 1x`;

  const qrisPath = path.join(__dirname, '..', '..', 'storage', 'qris', 'qris.png');
  if (fs.existsSync(qrisPath)) {
    await ctx.sock.sendMessage(ctx.from, { image: fs.readFileSync(qrisPath), caption: text }, { quoted: ctx.msg });
  } else {
    await ctx.reply(text);
  }
}

module.exports = payment;
