const fs = require('fs');
const path = require('path');
const config = require('../config');

async function payment(ctx) {
  const text = `💳 *PAYMENT METHOD*

📱 *GOPAY*
${config.payment.gopayNumber}
A/N ${config.payment.gopayName}

🏦 *SEABANK*
${config.payment.seabankNumber}
A/N ${config.payment.seabankName}

📲 *QRIS*
Tersedia, silakan scan QRIS yang dikirim bersama pesan ini.

━━━━━━━━━━━━━━━
⚠️ *CATATAN*
• Mohon kirim bukti pembayaran
• Order diproses setelah pembayaran valid
• Cukup kirim bukti pembayaran 1x`;

  const qrisPath = path.join(
    __dirname,
    '..',
    '..',
    'storage',
    'qris',
    'qris.png'
  );

  if (fs.existsSync(qrisPath)) {
    await ctx.sock.sendMessage(
      ctx.from,
      {
        image: fs.readFileSync(qrisPath),
        caption: text,
      },
      {
        quoted: ctx.msg,
      }
    );
  } else {
    await ctx.reply(text);
  }
}

module.exports = payment;