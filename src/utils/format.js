const moment = require('moment-timezone');
const config = require('../config');

function rupiah(num) {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return '-';
  return 'Rp' + Number(num).toLocaleString('id-ID');
}

function now() {
  return moment().tz(config.tz).format('YYYY-MM-DD HH:mm:ss');
}

function humanTime(value) {
  return moment(value).tz(config.tz).format('YYYY-MM-DD HH:mm:ss [WIB]');
}

function normalizeNumber(jidOrNumber = '') {
  return String(jidOrNumber).replace(/@.+$/, '').replace(/\D/g, '');
}

function jid(number) {
  return `${normalizeNumber(number)}@s.whatsapp.net`;
}

function makeOrderId() {
  const raw = Date.now().toString(36).toUpperCase().slice(-6);
  return `ORD-${raw}`;
}

function pickText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  ).trim();
}

function getSenderNumber(msg) {
  const jidValue = msg.key.participant || msg.key.remoteJid || '';
  return normalizeNumber(jidValue);
}

function isOwner(msg) {
  return msg.key.fromMe || getSenderNumber(msg) === config.ownerNumber;
}

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
};
