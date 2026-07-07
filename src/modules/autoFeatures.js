const db = require('../db');
const config = require('../config');
const { jid, isOwner } = require('../utils/format');

const pendingGroupTimers = new Map();

const GROUP_NO_REPLY_DELAY_MS = 5 * 60 * 1000;
const PRIVATE_WELCOME_RESET_MS = 24 * 60 * 60 * 1000;

function isGroup(chatJid) {
  return String(chatJid || '').endsWith('@g.us');
}

function normalizeNumber(value) {
  return String(value || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/[^\d]/g, '');
}

function getOwnerNumber() {
  return String(config.ownerNumber || '').replace(/[^\d]/g, '');
}

function getOwnerJid() {
  return jid(getOwnerNumber());
}

function getBotIdentityNumbers(ctx) {
  const candidates = [
    ctx.sock?.user?.id,
    ctx.sock?.user?.jid,
    ctx.sock?.user?.lid,
  ];

  return candidates
    .map(normalizeNumber)
    .filter(Boolean);
}

function getContentMessage(msg) {
  const m = msg.message || {};

  return (
    m.ephemeralMessage?.message ||
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2?.message ||
    m.documentWithCaptionMessage?.message ||
    m
  );
}

function getContextInfo(msg) {
  const m = getContentMessage(msg);

  for (const value of Object.values(m)) {
    if (value?.contextInfo) {
      return value.contextInfo;
    }
  }

  return null;
}

function getMentionedJids(msg) {
  const contextInfo = getContextInfo(msg);
  return contextInfo?.mentionedJid || [];
}

function getGroupMentions(msg) {
  const contextInfo = getContextInfo(msg);
  return contextInfo?.groupMentions || [];
}

function groupFeatureEnabled(groupJid) {
  try {
    const row = db.prepare(`
      SELECT enabled FROM group_features WHERE group_jid = ?
    `).get(groupJid);

    return Number(row?.enabled) === 1;
  } catch (err) {
    console.error('[GROUP FEATURE] Gagal cek fitur grup:', err.message);
    return false;
  }
}

function buildTargetNumbers(ctx) {
  const ownerNumber = getOwnerNumber();
  const ownerLocal = ownerNumber.startsWith('62')
    ? `0${ownerNumber.slice(2)}`
    : ownerNumber;

  const botNumbers = getBotIdentityNumbers(ctx);
  const botLocalNumbers = botNumbers.map((number) => {
    return number.startsWith('62') ? `0${number.slice(2)}` : number;
  });

  return [
    ownerNumber,
    ownerLocal,
    ...botNumbers,
    ...botLocalNumbers,
  ].filter(Boolean);
}

function mentionsEveryone(ctx) {
  const text = String(ctx.text || '').toLowerCase();
  const mentions = getMentionedJids(ctx.msg) || [];
  const groupMentions = getGroupMentions(ctx.msg) || [];

  const hasEveryoneText = /(^|\s)@(semua|all|everyone|anggota)\b/i.test(text);

  const hasGroupMentionMetadata = groupMentions.length > 0;

  const mentionedGroupJid = mentions.some((mentionedJid) => {
    const value = String(mentionedJid || '');
    return value === ctx.from || value.endsWith('@g.us');
  });

  return hasEveryoneText || hasGroupMentionMetadata || mentionedGroupJid;
}

function mentionsTarget(ctx) {
  const text = String(ctx.text || '').toLowerCase();
  const mentions = getMentionedJids(ctx.msg) || [];
  const targetNumbers = buildTargetNumbers(ctx);

  if (mentionsEveryone(ctx)) {
    return true;
  }

  const mentionedNumbers = mentions
    .map(normalizeNumber)
    .filter(Boolean);

  const mentionedByJid = mentionedNumbers.some((mentionedNumber) => {
    return targetNumbers.includes(mentionedNumber);
  });

  if (mentionedByJid) {
    return true;
  }

  for (const number of targetNumbers) {
    if (text.includes(number) || text.includes(`@${number}`)) {
      return true;
    }
  }

  const ownerName = String(config.ownerMentionName || 'Fauzy').toLowerCase();

  if (text.includes(`@${ownerName}`)) {
    return true;
  }

  const hasLidMention = mentions.some((mentionedJid) => {
    return String(mentionedJid || '').endsWith('@lid');
  });

  const hasNumericMentionText = /@\d{8,}/.test(text);

  if (hasLidMention && hasNumericMentionText) {
    return true;
  }

  return false;
}

function getMessageTimeText(msg) {
  let timestamp = msg.messageTimestamp;

  if (timestamp && typeof timestamp === 'object') {
    timestamp = Number(timestamp.low || timestamp.toString?.() || Date.now() / 1000);
  }

  const date = timestamp
    ? new Date(Number(timestamp) * 1000)
    : new Date();

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: config.tz || 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);
}

function clearPendingGroupTimer(groupJid) {
  const timer = pendingGroupTimers.get(groupJid);

  if (timer) {
    clearTimeout(timer);
    pendingGroupTimers.delete(groupJid);
  }
}

function setPendingGroupTimer(ctx) {
  clearPendingGroupTimer(ctx.from);

  const timer = setTimeout(async () => {
    try {
      if (!groupFeatureEnabled(ctx.from)) return;

      await ctx.sock.sendMessage(ctx.from, {
        text: 'Sudah lihat chat tapi gak dibales nih? 😭',
      });
    } catch (err) {
      console.error('[GROUP NO REPLY] Reminder error:', err.message);
    } finally {
      pendingGroupTimers.delete(ctx.from);
    }
  }, GROUP_NO_REPLY_DELAY_MS);

  pendingGroupTimers.set(ctx.from, timer);
}

async function handleGroupFeatures(ctx) {
  if (!isGroup(ctx.from)) return;
  if (!groupFeatureEnabled(ctx.from)) return;

  const text = String(ctx.text || '').trim();
  if (!text) return;

  const ownerName = config.ownerMentionName || 'Fauzy';
  const ownerMessage = isOwner(ctx.msg) || ctx.msg.key.fromMe;

  if (!ownerMessage && mentionsTarget(ctx)) {
    const senderJid = ctx.msg.key.participant || ctx.msg.participant || ctx.from;
    const senderLabel = normalizeNumber(senderJid) || 'there';
    const everyoneMentioned = mentionsEveryone(ctx);

    const responseText = everyoneMentioned
      ? `Hi @${senderLabel} 👋

Fauzy’s bot noticed the @semua mention 😄
Message received at ${getMessageTimeText(ctx.msg)}.
Please wait a bit, ${ownerName} will reply soon. Don’t run away yet hehe 🏃‍♂️💨`
      : `Hi @${senderLabel} 👋

Fauzy’s bot is awake and active 😄
Message received at ${getMessageTimeText(ctx.msg)}.
Please wait a bit, ${ownerName} will reply soon. Don’t run away yet hehe 🏃‍♂️💨`;

    await ctx.sock.sendMessage(
      ctx.from,
      {
        text: responseText,
        mentions: [senderJid],
      },
      { quoted: ctx.msg }
    );

    return;
  }

  if (ownerMessage && !text.startsWith(config.prefix)) {
    setPendingGroupTimer(ctx);
    return;
  }

  if (!ownerMessage) {
    clearPendingGroupTimer(ctx.from);
  }
}

function shouldSendPrivateWelcome(chatJid) {
  try {
    const row = db.prepare(`
      SELECT last_sent_at FROM private_welcome_logs WHERE chat_jid = ?
    `).get(chatJid);

    const current = Date.now();

    if (!row) return true;

    return current - Number(row.last_sent_at) >= PRIVATE_WELCOME_RESET_MS;
  } catch (err) {
    console.error('[PRIVATE WELCOME] Gagal cek log welcome:', err.message);
    return false;
  }
}

function savePrivateWelcomeTime(chatJid) {
  try {
    const current = Date.now();

    db.prepare(`
      INSERT INTO private_welcome_logs (chat_jid, last_sent_at)
      VALUES (?, ?)
      ON CONFLICT(chat_jid) DO UPDATE SET
        last_sent_at = excluded.last_sent_at
    `).run(chatJid, current);
  } catch (err) {
    console.error('[PRIVATE WELCOME] Gagal menyimpan waktu welcome:', err.message);
  }
}

async function handlePrivateWelcome(ctx) {
  if (isGroup(ctx.from)) return;
  if (!ctx.text) return;

  if (ctx.msg.key.fromMe) return;
  if (isOwner(ctx.msg)) return;

  if (!shouldSendPrivateWelcome(ctx.from)) return;

  savePrivateWelcomeTime(ctx.from);

  await ctx.sock.sendMessage(
    ctx.from,
    {
      text: `Halo 👋 Selamat datang di *Asistensi Tugas .ID*

Ketik *.menu* untuk melihat menu pelanggan.

Menu yang tersedia:
• *.catalog* — daftar akun premium
• *.jasa* — daftar layanan asistensi tugas
• *.payment* — metode pembayaran
• *.status ORD-xxxx* — cek status order

Silakan ketik *.menu* untuk mulai.`,
    },
    { quoted: ctx.msg }
  );
}

async function handleAutoFeatures(ctx) {
  await handlePrivateWelcome(ctx);
  await handleGroupFeatures(ctx);
}

module.exports = {
  handleAutoFeatures,
};