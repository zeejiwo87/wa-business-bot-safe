const db = require('../db');
const { isOwner, now } = require('../utils/format');

function normalizeTrigger(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function parseAddText(argsText) {
  const raw = String(argsText || '').trim();
  const separatorIndex = raw.indexOf(':');

  if (separatorIndex === -1) return null;

  const trigger = raw.slice(0, separatorIndex).trim();
  const response = raw.slice(separatorIndex + 1).trim();

  if (!trigger || !response) return null;

  return {
    trigger,
    triggerKey: normalizeTrigger(trigger),
    response,
  };
}

async function addtext(ctx) {
  if (!isOwner(ctx.msg)) {
    return ctx.reply('Command ini khusus owner/admin.');
  }

  const parsed = parseAddText(ctx.argsText);

  if (!parsed) {
    return ctx.reply(
      `Format salah.\n\nContoh:\n*.addtext love you : I love you more than words can explain.*`
    );
  }

  if (parsed.trigger.startsWith('.')) {
    return ctx.reply(
      `Trigger tidak perlu pakai titik.\n\nContoh benar:\n*.addtext love you : isi teksnya*`
    );
  }

  const forbiddenTriggers = [
    'menu',
    'help',
    'catalog',
    'katalog',
    'premium',
    'jasa',
    'tugas',
    'joki',
    'payment',
    'bayar',
    'order',
    'status',
    'cancel',
    'admin',
    'setlog',
    'reset',
    'edit',
    'grup',
    'group',
    'addtext',
    'deltext',
  ];

  if (forbiddenTriggers.includes(parsed.triggerKey)) {
    return ctx.reply(
      `Trigger *${parsed.trigger}* tidak bisa dipakai karena bentrok dengan command bot.`
    );
  }

  const time = now();

  db.prepare(`
    INSERT INTO custom_texts (
      trigger_key,
      trigger_text,
      response_text,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(trigger_key) DO UPDATE SET
      trigger_text = excluded.trigger_text,
      response_text = excluded.response_text,
      updated_at = excluded.updated_at
  `).run(
    parsed.triggerKey,
    parsed.trigger,
    parsed.response,
    time,
    time
  );

  return ctx.reply(
    `Custom text berhasil disimpan ✅\n\nTrigger: *${parsed.trigger}*\n\nSekarang kamu bisa ketik:\n${parsed.trigger}`
  );
}

async function deltext(ctx) {
  if (!isOwner(ctx.msg)) {
    return ctx.reply('Command ini khusus owner/admin.');
  }

  const trigger = String(ctx.argsText || '').trim();

  if (!trigger) {
    return ctx.reply(
      `Format salah.\n\nContoh:\n*.deltext love you*`
    );
  }

  const triggerKey = normalizeTrigger(trigger);

  const existing = db.prepare(`
    SELECT trigger_text
    FROM custom_texts
    WHERE trigger_key = ?
  `).get(triggerKey);

  if (!existing) {
    return ctx.reply(
      `Custom text dengan trigger *${trigger}* tidak ditemukan.`
    );
  }

  db.prepare(`
    DELETE FROM custom_texts
    WHERE trigger_key = ?
  `).run(triggerKey);

  return ctx.reply(
    `Custom text berhasil dihapus ✅\n\nTrigger: *${existing.trigger_text}*`
  );
}

function findCustomTextByMessage(messageText) {
  const triggerKey = normalizeTrigger(messageText);

  if (!triggerKey) return null;

  return db.prepare(`
    SELECT trigger_text, response_text
    FROM custom_texts
    WHERE trigger_key = ?
  `).get(triggerKey);
}

module.exports = {
  addtext,
  deltext,
  findCustomTextByMessage,
};