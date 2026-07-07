const db = require('../db');

const handledRevokeKeys = new Set();

function isGroup(chatJid) {
  return String(chatJid || '').endsWith('@g.us');
}

function groupFeatureEnabled(groupJid) {
  try {
    const row = db.prepare(`
      SELECT enabled FROM group_features WHERE group_jid = ?
    `).get(groupJid);

    return Number(row?.enabled) === 1;
  } catch (err) {
    console.error('[PRIVACY GUARD] Gagal cek fitur grup:', err.message);
    return false;
  }
}

function cleanNumber(jidValue) {
  const stringJid = String(jidValue || '');
  const match = stringJid.match(/^(\d+)/);
  return match ? match[1] : stringJid.split('@')[0];
}

function makeStoreKey(remoteJid, messageId) {
  return `${remoteJid || ''}:${messageId || ''}`;
}

function unwrapMessage(message = {}) {
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  );
}

function getProtocolMessage(item) {
  const message =
    item.update?.message ||
    item.message ||
    {};

  const realMessage = unwrapMessage(message);

  return realMessage.protocolMessage || null;
}

function getOuterKey(item) {
  return item.key || item.update?.key || {};
}

async function handleRevokeMessage(sock, update, messageStore) {
  for (const item of update) {
    const protocolMsg = getProtocolMessage(item);
    if (!protocolMsg) continue;

    const isRevoke =
      protocolMsg.type === 0 ||
      protocolMsg.type === 'REVOKE';

    if (!isRevoke) {
      console.log('[PRIVACY GUARD] Protocol masuk, tapi bukan revoke. Type:', protocolMsg.type);
      continue;
    }

    const outerKey = getOuterKey(item);
    const targetKey = protocolMsg.key || {};

    const targetId = targetKey.id;
    const from = targetKey.remoteJid || outerKey.remoteJid;

    if (!targetId || !from) {
      console.log('[PRIVACY GUARD] Target pesan hapus tidak lengkap:', {
        targetId,
        from,
        protocolMsg,
      });
      continue;
    }

    const storeKey = makeStoreKey(from, targetId);

    const savedMsg =
      messageStore.get(storeKey) ||
      messageStore.get(targetId);

    if (!savedMsg) {
      console.log('[PRIVACY GUARD] Pesan asli tidak ditemukan di cache.');
      console.log('[PRIVACY GUARD] targetId:', targetId);
      console.log('[PRIVACY GUARD] from:', from);
      console.log('[PRIVACY GUARD] storeKey:', storeKey);
      console.log('[PRIVACY GUARD] jumlah cache:', messageStore.size);
      continue;
    }

    /**
     * Chat pribadi: otomatis aktif
     * Grup: hanya aktif kalau .grup on
     */
    if (isGroup(from) && !groupFeatureEnabled(from)) {
      console.log('[PRIVACY GUARD] Grup belum .grup on, dilewati:', from);
      continue;
    }

    if (savedMsg.fromMe) {
      console.log('[PRIVACY GUARD] Pesan sendiri dihapus, dilewati.');
      continue;
    }

    const revokeKey = makeStoreKey(from, targetId);

    if (handledRevokeKeys.has(revokeKey)) {
      console.log('[PRIVACY GUARD] Revoke sudah pernah diproses, dilewati:', revokeKey);
      continue;
    }

    handledRevokeKeys.add(revokeKey);

    setTimeout(() => {
      handledRevokeKeys.delete(revokeKey);
    }, 60 * 1000);

    const senderPureNumber = cleanNumber(savedMsg.sender);

    let responseText = `⚠️ *Pesan Dihapus Terdeteksi!* ⚠️\n\n`;
    responseText += `👤 *Pengirim:* @${senderPureNumber}\n`;
    responseText += `🕒 *Waktu Kirim:* ${savedMsg.time}\n\n`;
    responseText += `📄 *Isi Pesan yang Dihapus:*\n`;
    responseText += `${savedMsg.text}`;

    try {
      const sendTo = savedMsg.from || from;

      const sent = await sock.sendMessage(sendTo, {
        text: responseText,
      });

      console.log('[PRIVACY GUARD] Pesan hapus berhasil dikirim langsung.');
      console.log('[PRIVACY GUARD] Dikirim ke:', sendTo);
      console.log('[PRIVACY GUARD] Sent ID:', sent?.key?.id);
    } catch (err) {
      console.error('[PRIVACY GUARD] Gagal kirim pesan hapus:', err);
    }
  }
}

module.exports = {
  handleRevokeMessage,
  makeStoreKey,
};