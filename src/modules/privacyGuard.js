const fs = require('fs');
const db = require('../db');

const handledRevokeKeys = new Set();


// ====================================================================
// 👥 CEK GRUP
// ====================================================================

function isGroup(chatJid) {
  return String(chatJid || '').endsWith('@g.us');
}


// ====================================================================
// 👥 CEK FITUR GRUP
// ====================================================================

function groupFeatureEnabled(groupJid) {
  try {
    const row = db.prepare(`
      SELECT enabled
      FROM group_features
      WHERE group_jid = ?
    `).get(groupJid);

    return Number(row?.enabled) === 1;
  } catch (err) {
    console.error(
      '[PRIVACY GUARD] Gagal cek fitur grup:',
      err.message
    );

    return false;
  }
}


// ====================================================================
// 🔢 BERSIHKAN JID / NOMOR
// ====================================================================

function cleanNumber(jidValue) {
  const stringJid = String(jidValue || '');

  const match = stringJid.match(/^(\d+)/);

  return match
    ? match[1]
    : stringJid.split('@')[0];
}


// ====================================================================
// 🔑 KEY MESSAGE STORE
// ====================================================================

function makeStoreKey(remoteJid, messageId) {
  return `${remoteJid || ''}:${messageId || ''}`;
}


// ====================================================================
// 📦 UNWRAP MESSAGE
// ====================================================================

function unwrapMessage(message = {}) {
  let current = message;

  while (
    current &&
    typeof current === 'object'
  ) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }

    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }

    if (current.editedMessage?.message) {
      current = current.editedMessage.message;
      continue;
    }

    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }

    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }

    if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message;
      continue;
    }

    break;
  }

  return current || {};
}


// ====================================================================
// 🗑️ AMBIL PROTOCOL MESSAGE
// ====================================================================

function getProtocolMessage(item) {
  const message =
    item?.update?.message ||
    item?.message ||
    {};

  const realMessage =
    unwrapMessage(message);

  return realMessage?.protocolMessage || null;
}


// ====================================================================
// 🔑 AMBIL OUTER KEY
// ====================================================================

function getOuterKey(item) {
  return (
    item?.key ||
    item?.update?.key ||
    {}
  );
}


// ====================================================================
// 🔒 DETEKSI VIEW ONCE
//
// TIDAK menggunakan recursive call.
// Ini mencegah:
// RangeError: Maximum call stack size exceeded
//
// View Once tidak akan pernah dipulihkan.
// ====================================================================

function isViewOnceMessage(message) {
  if (
    !message ||
    typeof message !== 'object'
  ) {
    return false;
  }

  let current = message;

  const visited = new Set();

  while (
    current &&
    typeof current === 'object'
  ) {
    // Perlindungan jika ada object circular
    if (visited.has(current)) {
      return false;
    }

    visited.add(current);


    // ================================================================
    // WRAPPER VIEW ONCE
    // ================================================================

    if (
      current.viewOnceMessage ||
      current.viewOnceMessageV2 ||
      current.viewOnceMessageV2Extension
    ) {
      return true;
    }


    // ================================================================
    // FLAG VIEW ONCE LANGSUNG
    // ================================================================

    if (
      current.imageMessage?.viewOnce === true ||
      current.videoMessage?.viewOnce === true
    ) {
      return true;
    }


    // ================================================================
    // LANJUT CEK WRAPPER LAIN
    // ================================================================

    if (
      current.ephemeralMessage?.message
    ) {
      current =
        current.ephemeralMessage.message;

      continue;
    }


    if (
      current.documentWithCaptionMessage?.message
    ) {
      current =
        current.documentWithCaptionMessage.message;

      continue;
    }


    if (
      current.editedMessage?.message
    ) {
      current =
        current.editedMessage.message;

      continue;
    }


    break;
  }

  return false;
}


// ====================================================================
// 📎 NAMA MEDIA
// ====================================================================

function getMediaLabel(media) {
  if (!media) {
    return 'Media';
  }

  switch (media.type) {
    case 'image':
      return 'Gambar';

    case 'video':
      return 'Video';

    case 'audio':
      return media.ptt
        ? 'Voice Note'
        : 'Audio';

    case 'sticker':
      return 'Sticker';

    default:
      return 'Media';
  }
}


// ====================================================================
// 📎 ICON MEDIA
// ====================================================================

function getMediaIcon(media) {
  if (!media) {
    return '📎';
  }

  switch (media.type) {
    case 'image':
      return '🖼️';

    case 'video':
      return '🎥';

    case 'audio':
      return '🎙️';

    case 'sticker':
      return '🏷️';

    default:
      return '📎';
  }
}


// ====================================================================
// 📝 HEADER ANTI DELETE
// ====================================================================

function buildHeader(savedMsg) {
  const senderPureNumber =
    cleanNumber(savedMsg.sender);

  let text =
    `⚠️ *Pesan Dihapus Terdeteksi!* ⚠️\n\n`;

  text +=
    `👤 *Pengirim:* @${senderPureNumber}\n`;

  text +=
    `🕒 *Waktu Kirim:* ${savedMsg.time || '-'}`;

  return text;
}


// ====================================================================
// 📄 RESPONSE PESAN TEXT
// ====================================================================

function buildTextResponse(savedMsg) {
  let text =
    buildHeader(savedMsg);

  text +=
    `\n\n📄 *Isi Pesan yang Dihapus:*\n`;

  text +=
    savedMsg.text ||
    '(Pesan kosong)';

  return text;
}


// ====================================================================
// 🎞️ CAPTION MEDIA
// ====================================================================

function buildMediaCaption(savedMsg) {
  const media =
    savedMsg.media;

  const mediaLabel =
    getMediaLabel(media);

  const mediaIcon =
    getMediaIcon(media);

  let text =
    buildHeader(savedMsg);

  text +=
    `\n\n${mediaIcon} *Media yang Dihapus:* ${mediaLabel}`;

  const originalCaption =
    String(
      media?.caption ||
      savedMsg.text ||
      ''
    ).trim();

  if (originalCaption) {
    text +=
      `\n\n📝 *Caption:*\n${originalCaption}`;
  }

  return text;
}


// ====================================================================
// 🧹 HAPUS CACHE SETELAH PESAN BERHASIL DIPULIHKAN
// ====================================================================

async function removeSavedMessageFromCache(
  messageStore,
  storeKey,
  targetId,
  savedMsg
) {
  messageStore.delete(storeKey);
  messageStore.delete(targetId);

  const mediaPath =
    savedMsg?.media?.path;

  if (!mediaPath) {
    return;
  }

  try {
    await fs.promises.rm(
      mediaPath,
      {
        force: true,
      }
    );
  } catch (err) {
    console.error(
      '[PRIVACY GUARD] Gagal hapus media cache:',
      err.message
    );
  }
}


// ====================================================================
// 🎞️ KIRIM ULANG MEDIA
// ====================================================================

async function sendRestoredMedia(
  sock,
  sendTo,
  savedMsg,
  mentions
) {
  const media =
    savedMsg.media;

  if (!media?.path) {
    throw new Error(
      'Path media cache tidak tersedia.'
    );
  }

  if (
    !fs.existsSync(media.path)
  ) {
    throw new Error(
      `File media cache tidak ditemukan: ${media.path}`
    );
  }

  const notificationText =
    buildMediaCaption(savedMsg);


  // ==================================================================
  // 🖼️ IMAGE
  // ==================================================================

  if (
    media.type === 'image'
  ) {
    return sock.sendMessage(
      sendTo,
      {
        image: {
          url: media.path,
        },

        caption:
          notificationText,

        mentions,
      }
    );
  }


  // ==================================================================
  // 🎥 VIDEO
  // ==================================================================

  if (
    media.type === 'video'
  ) {
    return sock.sendMessage(
      sendTo,
      {
        video: {
          url: media.path,
        },

        caption:
          notificationText,

        mimetype:
          media.mimetype ||
          'video/mp4',

        mentions,
      }
    );
  }


  // ==================================================================
  // 🎙️ AUDIO / VOICE NOTE
  // ==================================================================

  if (
    media.type === 'audio'
  ) {
    // Audio/VN tidak memiliki caption,
    // jadi informasi dikirim dahulu.

    await sock.sendMessage(
      sendTo,
      {
        text:
          notificationText,

        mentions,
      }
    );


    return sock.sendMessage(
      sendTo,
      {
        audio: {
          url: media.path,
        },

        mimetype:
          media.mimetype ||
          'audio/ogg; codecs=opus',

        ptt:
          Boolean(media.ptt),
      }
    );
  }


  // ==================================================================
  // 🏷️ STICKER
  // ==================================================================

  if (
    media.type === 'sticker'
  ) {
    // Sticker tidak memiliki caption,
    // jadi informasi dikirim dahulu.

    await sock.sendMessage(
      sendTo,
      {
        text:
          notificationText,

        mentions,
      }
    );


    return sock.sendMessage(
      sendTo,
      {
        sticker: {
          url: media.path,
        },
      }
    );
  }


  throw new Error(
    `Tipe media tidak didukung: ${media.type}`
  );
}


// ====================================================================
// 🛡️ HANDLE REVOKE
// ====================================================================

async function handleRevokeMessage(
  sock,
  update,
  messageStore
) {
  for (
    const item of update || []
  ) {
    const protocolMsg =
      getProtocolMessage(item);


    // Tidak ada protocol message
    if (!protocolMsg) {
      continue;
    }


    // ==================================================================
    // PASTIKAN REVOKE / DELETE FOR EVERYONE
    // ==================================================================

    const isRevoke =
      protocolMsg.type === 0 ||
      protocolMsg.type === 'REVOKE';


    /*
      Protocol WhatsApp tidak hanya revoke.
      Type 5, 6, 9, 17 dan sebagainya
      cukup dilewati tanpa memenuhi terminal.
    */

    if (!isRevoke) {
      continue;
    }


    // ==================================================================
    // TARGET PESAN
    // ==================================================================

    const outerKey =
      getOuterKey(item);

    const targetKey =
      protocolMsg.key || {};

    const targetId =
      targetKey.id;

    const from =
      targetKey.remoteJid ||
      outerKey.remoteJid;


    if (
      !targetId ||
      !from
    ) {
      console.log(
        '[PRIVACY GUARD] Target revoke tidak lengkap:',
        {
          targetId,
          from,
        }
      );

      continue;
    }


    console.log(
      '[PRIVACY GUARD] Revoke terdeteksi:',
      targetId
    );


    // ==================================================================
    // CARI PESAN ASLI
    // ==================================================================

    const storeKey =
      makeStoreKey(
        from,
        targetId
      );


    const savedMsg =
      messageStore.get(storeKey) ||
      messageStore.get(targetId);


    if (!savedMsg) {
      console.log(
        '[PRIVACY GUARD] Pesan asli tidak ditemukan di cache.'
      );

      console.log(
        '[PRIVACY GUARD] targetId:',
        targetId
      );

      console.log(
        '[PRIVACY GUARD] from:',
        from
      );

      continue;
    }


    // ==================================================================
    // 🔒 VIEW ONCE
    // ==================================================================

    if (
      isViewOnceMessage(
        savedMsg?.rawMsg?.message
      )
    ) {
      console.log(
        '[PRIVACY GUARD] View Once dilewati.'
      );

      return;
    }


    // ==================================================================
    // 👥 GRUP
    // ==================================================================

    if (
      isGroup(from) &&
      !groupFeatureEnabled(from)
    ) {
      console.log(
        '[PRIVACY GUARD] Grup belum .grup on, dilewati:',
        from
      );

      continue;
    }


    // ==================================================================
    // PESAN SENDIRI
    // ==================================================================

    if (
      savedMsg.fromMe
    ) {
      console.log(
        '[PRIVACY GUARD] Pesan sendiri dihapus, dilewati.'
      );

      continue;
    }


    // ==================================================================
    // CEGAH DOUBLE REVOKE
    // ==================================================================

    const revokeKey =
      makeStoreKey(
        from,
        targetId
      );


    if (
      handledRevokeKeys.has(revokeKey)
    ) {
      console.log(
        '[PRIVACY GUARD] Revoke sudah diproses:',
        revokeKey
      );

      continue;
    }


    handledRevokeKeys.add(
      revokeKey
    );


    const handledTimer =
      setTimeout(
        () => {
          handledRevokeKeys.delete(
            revokeKey
          );
        },
        60 * 1000
      );


    // ==================================================================
    // TUJUAN CHAT
    // ==================================================================

    const sendTo =
      savedMsg.from ||
      from;


    const mentions =
      savedMsg.sender
        ? [savedMsg.sender]
        : [];


    // ==================================================================
    // KIRIM PESAN
    // ==================================================================

    try {
      let sent;


      // ================================================================
      // MEDIA
      // ================================================================

      if (
        savedMsg.media?.path
      ) {
        sent =
          await sendRestoredMedia(
            sock,
            sendTo,
            savedMsg,
            mentions
          );


        console.log(
          '[PRIVACY GUARD] Media berhasil dipulihkan:',
          getMediaLabel(
            savedMsg.media
          )
        );
      }


      // ================================================================
      // TEXT
      // ================================================================

      else {
        const responseText =
          buildTextResponse(
            savedMsg
          );


        sent =
          await sock.sendMessage(
            sendTo,
            {
              text:
                responseText,

              mentions,
            }
          );


        console.log(
          '[PRIVACY GUARD] Pesan teks berhasil dipulihkan.'
        );
      }


      console.log(
        '[PRIVACY GUARD] Dikirim ke:',
        sendTo
      );


      console.log(
        '[PRIVACY GUARD] Sent ID:',
        sent?.key?.id
      );


      // ================================================================
      // HAPUS CACHE SETELAH BERHASIL
      // ================================================================

      await removeSavedMessageFromCache(
        messageStore,
        storeKey,
        targetId,
        savedMsg
      );


    } catch (err) {
      console.error(
        '[PRIVACY GUARD] Gagal memulihkan pesan:',
        err
      );


      clearTimeout(
        handledTimer
      );


      handledRevokeKeys.delete(
        revokeKey
      );


      // ================================================================
      // FALLBACK JIKA MEDIA GAGAL
      // ================================================================

      if (
        savedMsg.media?.path &&
        savedMsg.text
      ) {
        try {
          const fallbackText =
            buildTextResponse(
              savedMsg
            );


          await sock.sendMessage(
            sendTo,
            {
              text:
                `${fallbackText}\n\n⚠️ Media tidak berhasil dipulihkan dari cache.`,

              mentions,
            }
          );

        } catch (fallbackErr) {
          console.error(
            '[PRIVACY GUARD] Fallback text gagal:',
            fallbackErr
          );
        }
      }
    }
  }
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = {
  handleRevokeMessage,
  makeStoreKey,
};