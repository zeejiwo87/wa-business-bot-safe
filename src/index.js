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
const { pickText } = require('./utils/format');
const { handleRevokeMessage, makeStoreKey } = require('./modules/privacyGuard');
const { handleNoCallCommand, handleIncomingCall } = require('./modules/nocall');
const { handleAITextCommand } = require('./modules/aiText');

require('./db');

const messageStore = new Map();

// Pesan yang disimpan untuk fitur anti-hapus akan bertahan 24 jam
const MESSAGE_STORE_TTL_MS = 24 * 60 * 60 * 1000;

function hasProtocolMessage(msg) {
  const message = msg.message || {};

  return Boolean(
    message.protocolMessage ||
    message.ephemeralMessage?.message?.protocolMessage ||
    message.viewOnceMessage?.message?.protocolMessage ||
    message.viewOnceMessageV2?.message?.protocolMessage
  );
}

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
    logger: pino({ level: 'error' }),
    browser: Browsers.macOS('Chrome'),
  });

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
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log('Koneksi tertutup.');
      console.log('Status code:', statusCode);
      console.log('Reconnect:', shouldReconnect);

      if (shouldReconnect) {
        start();
      } else {
        console.log('Session logout. Hapus folder sessions lalu scan QR ulang.');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ====================================================================
  // 📵 FITUR NO CALL
  // Jika fitur aktif, panggilan masuk akan ditolak otomatis.
  // ====================================================================
  sock.ev.on('call', async (calls) => {
    try {
      await handleIncomingCall(sock, calls);
    } catch (err) {
      console.error('[NOCALL EVENT ERROR]', err);
    }
  });

  sock.ev.on('messages.update', async (update) => {
    try {
      await handleRevokeMessage(sock, update, messageStore);
    } catch (err) {
      console.error('[REVOKE UPDATE ERROR]', err);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message) {
        continue;
      }

      try {
        // ====================================================================
        // 📵 COMMAND NO CALL
        // .nocall on
        // .nocall off
        // .nocall
        // ====================================================================
        try {
          const noCallHandled = await handleNoCallCommand(sock, msg);

          if (noCallHandled) {
            continue;
          }
        } catch (err) {
          console.error('[INDEX NOCALL ERROR]', err);
        }

        // ====================================================================
        // 🤖 COMMAND AI TEXT
        // .balas
        // .maaf
        // .romantis
        // ====================================================================
        try {
          const aiHandled = await handleAITextCommand(sock, msg);

          if (aiHandled) {
            continue;
          }
        } catch (err) {
          console.error('[INDEX AI TEXT ERROR]', err);
        }

        // ====================================================================
        // 🛡️ FITUR ANTI HAPUS / REVOKE
        // ====================================================================
        if (hasProtocolMessage(msg)) {
          await handleRevokeMessage(sock, [msg], messageStore);
          continue;
        }

        const messageId = msg.key?.id;
        if (!messageId) continue;

        if (msg.key.fromMe && botMessageIds.has(messageId)) {
          continue;
        }

        const incomingText = pickText(msg);

        if (incomingText) {
          const senderJid =
            msg.key.participant ||
            msg.participant ||
            msg.key.remoteJid;

          const storeKey = makeStoreKey(msg.key.remoteJid, messageId);

          const savedData = {
            id: messageId,
            from: msg.key.remoteJid,
            sender: senderJid,
            text: incomingText,
            fromMe: msg.key.fromMe,
            rawMsg: msg,
            time: new Date().toLocaleTimeString('id-ID', {
              timeZone: config.tz,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          };

          messageStore.set(storeKey, savedData);
          messageStore.set(messageId, savedData);

          console.log('[MESSAGE STORE] Pesan tersimpan dari:', senderJid);

          setTimeout(() => {
            messageStore.delete(storeKey);
            messageStore.delete(messageId);
          }, MESSAGE_STORE_TTL_MS);
        }

        await route(sock, msg);
      } catch (err) {
        console.error('Handler error:', err);
      }
    }
  });
}

start().catch((err) => console.error(err));