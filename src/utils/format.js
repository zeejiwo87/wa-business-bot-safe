const moment = require('moment-timezone');
const config = require('../config');

function rupiah(num) {
  if (
    num === null ||
    num === undefined ||
    Number.isNaN(Number(num))
  ) {
    return '-';
  }

  return 'Rp' + Number(num).toLocaleString('id-ID');
}

function now() {
  return moment()
    .tz(config.tz)
    .format('YYYY-MM-DD HH:mm:ss');
}

function humanTime(value) {
  return moment(value)
    .tz(config.tz)
    .format('YYYY-MM-DD HH:mm:ss [WIB]');
}

function normalizeNumber(jidOrNumber = '') {
  return String(jidOrNumber)
    .replace(/@.+$/, '')
    .replace(/\D/g, '');
}

function jid(number) {
  return `${normalizeNumber(number)}@s.whatsapp.net`;
}

function makeOrderId() {
  const raw = Date.now()
    .toString(36)
    .toUpperCase()
    .slice(-6);

  return `ORD-${raw}`;
}


// ====================================================================
// 📦 UNWRAP MESSAGE
//
// Membuka wrapper pesan WhatsApp seperti:
// - Ephemeral
// - View Once
// - View Once V2
// - View Once V2 Extension
// - Document With Caption
// - Edited Message
//
// Dibuat recursive supaya tetap bekerja walaupun wrapper bertumpuk.
// ====================================================================

function unwrapMessage(message = {}) {
  let current = message;

  while (current && typeof current === 'object') {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
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

    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }

    if (current.editedMessage?.message) {
      current = current.editedMessage.message;
      continue;
    }

    break;
  }

  return current || {};
}


// ====================================================================
// 📝 AMBIL TEXT / CAPTION
// ====================================================================

function pickText(msg) {
  const m = unwrapMessage(
    msg?.message || {}
  );

  return String(
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
}


// ====================================================================
// 👤 NOMOR PENGIRIM
// ====================================================================

function getSenderNumber(msg) {
  const jidValue =
    msg?.key?.participant ||
    msg?.participant ||
    msg?.key?.remoteJid ||
    '';

  return normalizeNumber(jidValue);
}


// ====================================================================
// 👑 CEK OWNER
// ====================================================================

function isOwner(msg) {
  return (
    Boolean(msg?.key?.fromMe) ||
    getSenderNumber(msg) === config.ownerNumber
  );
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = {
  rupiah,
  now,
  humanTime,
  normalizeNumber,
  jid,
  makeOrderId,
  pickText,
  getSenderNumber,
  isOwner,
  unwrapMessage,
};