const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const route = require('./router');
const config = require('./config');

require('./db');

async function start() {
  const sessionDir = path.join(__dirname, '..', 'sessions');

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.macOS('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  /*
    Anti-loop:
    Bot tetap boleh membaca pesan fromMe yang kamu ketik manual.
    Tapi pesan yang dikirim otomatis oleh bot akan diabaikan.
  */
  const botMessageIds = new Set();
  const originalSendMessage = sock.sendMessage.bind(sock);

  sock.sendMessage = async (...args) => {
    const sent = await originalSendMessage(...args);

    const messageId = sent?.key?.id;
    if (messageId) {
      botMessageIds.add(messageId);

      setTimeout(() => {
        botMessageIds.delete(messageId);
      }, 5 * 60 * 1000);
    }

    return sent;
  };

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nScan QR ini dari WhatsApp > Perangkat tertaut:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log(`✅ ${config.botName} aktif.`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log('Koneksi tertutup.');
      console.log('Status code:', statusCode);
      console.log('Error:', errorMessage);
      console.log('Reconnect:', shouldReconnect);

      if (shouldReconnect) {
        start();
      } else {
        console.log('Session logout. Hapus folder sessions lalu scan QR ulang.');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (!msg.message) continue;

        const messageId = msg.key?.id;

        // Abaikan hanya pesan yang dikirim otomatis oleh bot
        if (msg.key.fromMe && botMessageIds.has(messageId)) {
          continue;
        }

        await route(sock, msg);
      } catch (err) {
        console.error('Handler error:', err);
      }
    }
  });
}

start().catch((err) => console.error(err));