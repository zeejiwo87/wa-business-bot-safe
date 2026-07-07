const fs = require('fs');
const path = require('path');

const noCallFile = path.join(__dirname, '..', '..', 'nocall.json');

const recentlyRejectedCalls = new Set();

function loadState() {
  try {
    if (!fs.existsSync(noCallFile)) {
      const defaultState = { enabled: false };
      fs.writeFileSync(noCallFile, JSON.stringify(defaultState, null, 2));
      return defaultState;
    }

    const data = JSON.parse(fs.readFileSync(noCallFile, 'utf-8'));

    return {
      enabled: Boolean(data.enabled),
    };
  } catch (err) {
    console.error('[NOCALL] Gagal membaca nocall.json:', err.message);
    return { enabled: false };
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(noCallFile, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[NOCALL] Gagal menyimpan nocall.json:', err.message);
  }
}

function isNoCallEnabled() {
  return loadState().enabled;
}

function getText(msg) {
  const message = msg.message || {};

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  ).trim();
}

function isOwnerCommand(msg) {
  // Biar hanya kamu sendiri yang bisa ON/OFF fitur ini.
  // Pesan dari akun sendiri biasanya fromMe = true.
  return Boolean(msg.key?.fromMe);
}

async function handleNoCallCommand(sock, msg) {
  if (!msg?.message) return false;

  const text = getText(msg);
  const lower = text.toLowerCase();

  if (!lower.startsWith('.nocall')) return false;

  const from = msg.key.remoteJid;

  if (!isOwnerCommand(msg)) {
    await sock.sendMessage(
      from,
      {
        text: '❌ Fitur ini hanya bisa diatur oleh owner/bot sendiri.',
      },
      { quoted: msg }
    );

    return true;
  }

  const args = lower.split(/\s+/);
  const action = args[1];

  if (!action) {
    const status = isNoCallEnabled() ? 'ON' : 'OFF';

    await sock.sendMessage(
      from,
      {
        text:
          `📵 *No Call saat ini: ${status}*\n\n` +
          'Gunakan:\n' +
          '• *.nocall on* untuk menolak panggilan otomatis\n' +
          '• *.nocall off* untuk mematikan fitur',
      },
      { quoted: msg }
    );

    return true;
  }

  if (action === 'on') {
    saveState({ enabled: true });

    await sock.sendMessage(
      from,
      {
        text:
          '✅ *No Call diaktifkan!*\n\n' +
          'Jika ada panggilan WhatsApp masuk, bot akan otomatis menolaknya.',
      },
      { quoted: msg }
    );

    return true;
  }

  if (action === 'off') {
    saveState({ enabled: false });

    await sock.sendMessage(
      from,
      {
        text:
          '✅ *No Call dimatikan!*\n\n' +
          'Panggilan WhatsApp tidak akan ditolak otomatis lagi.',
      },
      { quoted: msg }
    );

    return true;
  }

  await sock.sendMessage(
    from,
    {
      text:
        '❌ Format salah.\n\n' +
        'Gunakan:\n' +
        '• *.nocall on*\n' +
        '• *.nocall off*\n' +
        '• *.nocall*',
    },
    { quoted: msg }
  );

  return true;
}

async function handleIncomingCall(sock, calls) {
  if (!Array.isArray(calls)) return;

  if (!isNoCallEnabled()) return;

  for (const call of calls) {
    try {
      const callId = call.id;
      const callFrom = call.from;

      // Status call bisa offer, ringing, accept, reject, terminate, dll.
      // Yang perlu ditolak hanya panggilan masuk awal.
      if (!['offer', 'ringing'].includes(call.status)) {
        continue;
      }

      if (!callId || !callFrom) {
        console.log('[NOCALL] Data panggilan tidak lengkap:', call);
        continue;
      }

      const rejectKey = `${callFrom}:${callId}`;

      if (recentlyRejectedCalls.has(rejectKey)) {
        continue;
      }

      recentlyRejectedCalls.add(rejectKey);

      setTimeout(() => {
        recentlyRejectedCalls.delete(rejectKey);
      }, 60 * 1000);

      console.log('--------------------------------------------------');
      console.log('[NOCALL] Panggilan masuk terdeteksi');
      console.log('[NOCALL] Dari:', callFrom);
      console.log('[NOCALL] Status:', call.status);
      console.log('[NOCALL] Menolak panggilan...');

      await sock.rejectCall(callId, callFrom);

      console.log('[NOCALL] ✅ Panggilan berhasil ditolak');
      console.log('--------------------------------------------------');
    } catch (err) {
      console.error('[NOCALL] Gagal menolak panggilan:', err.message);
    }
  }
}

module.exports = {
  handleNoCallCommand,
  handleIncomingCall,
  isNoCallEnabled,
};