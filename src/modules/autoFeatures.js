const db = require('../db');
const config = require('../config');
const { jid, isOwner } = require('../utils/format');

const pendingGroupTimers = new Map();


// ====================================================================
// ⏱️ KONFIGURASI WAKTU
// ====================================================================

// Reminder grup jika chat owner belum dibalas
const GROUP_NO_REPLY_DELAY_MS = 5 * 60 * 1000;

// Welcome private maksimal 1x setiap 7 hari
const PRIVATE_WELCOME_RESET_MS =
  7 * 24 * 60 * 60 * 1000;


// ====================================================================
// 👥 CEK GRUP
// ====================================================================

function isGroup(chatJid) {
  return String(chatJid || '').endsWith('@g.us');
}


// ====================================================================
// 🔢 NORMALISASI NOMOR
// ====================================================================

function normalizeNumber(value) {
  return String(value || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/[^\d]/g, '');
}


// ====================================================================
// 👑 NOMOR OWNER
// ====================================================================

function getOwnerNumber() {
  return String(
    config.ownerNumber || ''
  ).replace(/[^\d]/g, '');
}


// ====================================================================
// 👑 JID OWNER
// ====================================================================

function getOwnerJid() {
  return jid(
    getOwnerNumber()
  );
}


// ====================================================================
// 🤖 IDENTITAS NOMOR BOT
// ====================================================================

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


// ====================================================================
// 📦 AMBIL ISI PESAN
// ====================================================================

function getContentMessage(msg) {
  let current =
    msg?.message || {};

  while (
    current &&
    typeof current === 'object'
  ) {
    if (
      current.ephemeralMessage?.message
    ) {
      current =
        current.ephemeralMessage.message;

      continue;
    }

    if (
      current.viewOnceMessage?.message
    ) {
      current =
        current.viewOnceMessage.message;

      continue;
    }

    if (
      current.viewOnceMessageV2?.message
    ) {
      current =
        current.viewOnceMessageV2.message;

      continue;
    }

    if (
      current.viewOnceMessageV2Extension?.message
    ) {
      current =
        current.viewOnceMessageV2Extension.message;

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

  return current || {};
}


// ====================================================================
// 🏷️ CONTEXT INFO
// ====================================================================

function getContextInfo(msg) {
  const m =
    getContentMessage(msg);

  for (
    const value of Object.values(m)
  ) {
    if (
      value &&
      typeof value === 'object' &&
      value.contextInfo
    ) {
      return value.contextInfo;
    }
  }

  return null;
}


// ====================================================================
// 🏷️ MENTIONED JID
// ====================================================================

function getMentionedJids(msg) {
  const contextInfo =
    getContextInfo(msg);

  return (
    contextInfo?.mentionedJid ||
    []
  );
}


// ====================================================================
// 👥 GROUP MENTIONS
// ====================================================================

function getGroupMentions(msg) {
  const contextInfo =
    getContextInfo(msg);

  return (
    contextInfo?.groupMentions ||
    []
  );
}


// ====================================================================
// 👥 CEK STATUS FITUR GRUP
// ====================================================================

function groupFeatureEnabled(groupJid) {
  try {
    const row =
      db.prepare(`
        SELECT enabled
        FROM group_features
        WHERE group_jid = ?
      `).get(groupJid);

    return Number(
      row?.enabled
    ) === 1;
  } catch (err) {
    console.error(
      '[GROUP FEATURE] Gagal cek fitur grup:',
      err.message
    );

    return false;
  }
}


// ====================================================================
// 🎯 TARGET MENTION OWNER / BOT
// ====================================================================

function buildTargetNumbers(ctx) {
  const ownerNumber =
    getOwnerNumber();

  const ownerLocal =
    ownerNumber.startsWith('62')
      ? `0${ownerNumber.slice(2)}`
      : ownerNumber;

  const botNumbers =
    getBotIdentityNumbers(ctx);

  const botLocalNumbers =
    botNumbers.map((number) => {
      return number.startsWith('62')
        ? `0${number.slice(2)}`
        : number;
    });

  return [
    ownerNumber,
    ownerLocal,
    ...botNumbers,
    ...botLocalNumbers,
  ].filter(Boolean);
}


// ====================================================================
// 📢 DETEKSI @SEMUA / @ALL
// ====================================================================

function mentionsEveryone(ctx) {
  const text =
    String(
      ctx.text || ''
    ).toLowerCase();

  const mentions =
    getMentionedJids(
      ctx.msg
    ) || [];

  const groupMentions =
    getGroupMentions(
      ctx.msg
    ) || [];

  const hasEveryoneText =
    /(^|\s)@(semua|all|everyone|anggota)\b/i.test(
      text
    );

  const hasGroupMentionMetadata =
    groupMentions.length > 0;

  const mentionedGroupJid =
    mentions.some(
      (mentionedJid) => {
        const value =
          String(
            mentionedJid || ''
          );

        return (
          value === ctx.from ||
          value.endsWith('@g.us')
        );
      }
    );

  return (
    hasEveryoneText ||
    hasGroupMentionMetadata ||
    mentionedGroupJid
  );
}


// ====================================================================
// 🎯 DETEKSI TAG OWNER / BOT
// ====================================================================

function mentionsTarget(ctx) {
  const text =
    String(
      ctx.text || ''
    ).toLowerCase();

  const mentions =
    getMentionedJids(
      ctx.msg
    ) || [];

  const targetNumbers =
    buildTargetNumbers(ctx);


  if (
    mentionsEveryone(ctx)
  ) {
    return true;
  }


  const mentionedNumbers =
    mentions
      .map(normalizeNumber)
      .filter(Boolean);


  const mentionedByJid =
    mentionedNumbers.some(
      (mentionedNumber) => {
        return targetNumbers.includes(
          mentionedNumber
        );
      }
    );


  if (mentionedByJid) {
    return true;
  }


  for (
    const number of targetNumbers
  ) {
    if (
      text.includes(number) ||
      text.includes(`@${number}`)
    ) {
      return true;
    }
  }


  const ownerName =
    String(
      config.ownerMentionName ||
      'Fauzy'
    ).toLowerCase();


  if (
    text.includes(
      `@${ownerName}`
    )
  ) {
    return true;
  }


  const hasLidMention =
    mentions.some(
      (mentionedJid) => {
        return String(
          mentionedJid || ''
        ).endsWith('@lid');
      }
    );


  const hasNumericMentionText =
    /@\d{8,}/.test(text);


  if (
    hasLidMention &&
    hasNumericMentionText
  ) {
    return true;
  }


  return false;
}


// ====================================================================
// 🕒 WAKTU PESAN
// ====================================================================

function getMessageTimeText(msg) {
  let timestamp =
    msg.messageTimestamp;

  if (
    timestamp &&
    typeof timestamp === 'object'
  ) {
    timestamp = Number(
      timestamp.low ||
      timestamp.toString?.() ||
      Date.now() / 1000
    );
  }

  const date =
    timestamp
      ? new Date(
          Number(timestamp) * 1000
        )
      : new Date();


  return new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone:
        config.tz ||
        'Asia/Jakarta',

      hour:
        '2-digit',

      minute:
        '2-digit',

      second:
        '2-digit',

      hour12:
        false,

      timeZoneName:
        'short',
    }
  ).format(date);
}


// ====================================================================
// ⏱️ HAPUS TIMER GRUP
// ====================================================================

function clearPendingGroupTimer(
  groupJid
) {
  const timer =
    pendingGroupTimers.get(
      groupJid
    );

  if (timer) {
    clearTimeout(timer);

    pendingGroupTimers.delete(
      groupJid
    );
  }
}


// ====================================================================
// ⏱️ SET TIMER REMINDER GRUP
// ====================================================================

function setPendingGroupTimer(ctx) {
  clearPendingGroupTimer(
    ctx.from
  );

  const timer =
    setTimeout(
      async () => {
        try {
          if (
            !groupFeatureEnabled(
              ctx.from
            )
          ) {
            return;
          }

          await ctx.sock.sendMessage(
            ctx.from,
            {
              text:
                'Sudah lihat chat tapi gak dibales nih? 😭',
            }
          );
        } catch (err) {
          console.error(
            '[GROUP NO REPLY] Reminder error:',
            err.message
          );
        } finally {
          pendingGroupTimers.delete(
            ctx.from
          );
        }
      },
      GROUP_NO_REPLY_DELAY_MS
    );

  pendingGroupTimers.set(
    ctx.from,
    timer
  );
}


// ====================================================================
// 👥 FITUR OTOMATIS GRUP
// ====================================================================

async function handleGroupFeatures(ctx) {
  if (
    !isGroup(ctx.from)
  ) {
    return;
  }

  if (
    !groupFeatureEnabled(
      ctx.from
    )
  ) {
    return;
  }


  const text =
    String(
      ctx.text || ''
    ).trim();


  if (!text) {
    return;
  }


  const ownerName =
    config.ownerMentionName ||
    'Fauzy';


  const ownerMessage =
    isOwner(ctx.msg) ||
    Boolean(
      ctx.msg?.key?.fromMe
    );


  // ==================================================================
  // AUTO REPLY JIKA OWNER / BOT DITAG
  // ==================================================================

  if (
    !ownerMessage &&
    mentionsTarget(ctx)
  ) {
    const senderJid =
      ctx.msg?.key?.participant ||
      ctx.msg?.participant ||
      ctx.from;


    const senderLabel =
      normalizeNumber(
        senderJid
      ) || 'there';


    const everyoneMentioned =
      mentionsEveryone(ctx);


    const responseText =
      everyoneMentioned
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
        text:
          responseText,

        mentions: [
          senderJid,
        ],
      },
      {
        quoted:
          ctx.msg,
      }
    );


    return;
  }


  // ==================================================================
  // OWNER CHAT → MULAI TIMER
  // ==================================================================

  if (
    ownerMessage &&
    !text.startsWith(
      config.prefix
    )
  ) {
    setPendingGroupTimer(ctx);

    return;
  }


  // ==================================================================
  // ADA ORANG MEMBALAS → TIMER DIBATALKAN
  // ==================================================================

  if (!ownerMessage) {
    clearPendingGroupTimer(
      ctx.from
    );
  }
}


// ====================================================================
// 👋 CEK APAKAH WELCOME HARUS DIKIRIM
//
// RETURN:
// {
//   shouldSend: true/false,
//   isNew: true/false
// }
// ====================================================================

function getPrivateWelcomeStatus(
  chatJid
) {
  try {
    const row =
      db.prepare(`
        SELECT last_sent_at
        FROM private_welcome_logs
        WHERE chat_jid = ?
      `).get(chatJid);


    const current =
      Date.now();


    // ================================================================
    // NOMOR BARU / BELUM PERNAH TERCATAT
    // ================================================================

    if (!row) {
      return {
        shouldSend: true,
        isNew: true,
      };
    }


    const lastSentAt =
      Number(
        row.last_sent_at
      ) || 0;


    const elapsed =
      current -
      lastSentAt;


    // ================================================================
    // SUDAH 7 HARI ATAU LEBIH
    // ================================================================

    if (
      elapsed >=
      PRIVATE_WELCOME_RESET_MS
    ) {
      return {
        shouldSend: true,
        isNew: false,
      };
    }


    // ================================================================
    // MASIH DALAM 7 HARI
    // ================================================================

    return {
      shouldSend: false,
      isNew: false,
    };

  } catch (err) {
    console.error(
      '[PRIVATE WELCOME] Gagal cek log welcome:',
      err.message
    );

    return {
      shouldSend: false,
      isNew: false,
    };
  }
}


// ====================================================================
// 💾 SIMPAN WAKTU WELCOME
// ====================================================================

function savePrivateWelcomeTime(
  chatJid
) {
  try {
    const current =
      Date.now();


    db.prepare(`
      INSERT INTO private_welcome_logs (
        chat_jid,
        last_sent_at
      )

      VALUES (?, ?)

      ON CONFLICT(chat_jid)
      DO UPDATE SET
        last_sent_at = excluded.last_sent_at
    `).run(
      chatJid,
      current
    );


    return true;

  } catch (err) {
    console.error(
      '[PRIVATE WELCOME] Gagal menyimpan waktu welcome:',
      err.message
    );

    return false;
  }
}


// ====================================================================
// 👋 WELCOME CHAT PRIBADI
// ====================================================================

async function handlePrivateWelcome(
  ctx
) {
  // ==================================================================
  // JANGAN DI GRUP
  // ==================================================================

  if (
    isGroup(ctx.from)
  ) {
    return;
  }


  // ==================================================================
  // HARUS ADA PESAN
  //
  // Tidak wajib text.
  // Jadi gambar, video, VN, sticker juga bisa memicu welcome pertama.
  // ==================================================================

  if (
    !ctx.msg?.message
  ) {
    return;
  }


  // ==================================================================
  // PESAN BOT / OWNER SENDIRI
  // ==================================================================

  if (
    ctx.msg?.key?.fromMe
  ) {
    return;
  }


  if (
    isOwner(ctx.msg)
  ) {
    return;
  }


  // ==================================================================
  // CEK STATUS WELCOME
  // ==================================================================

  const welcomeStatus =
    getPrivateWelcomeStatus(
      ctx.from
    );


  if (
    !welcomeStatus.shouldSend
  ) {
    return;
  }


  // ==================================================================
  // KIRIM WELCOME
  // ==================================================================

  try {
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
      {
        quoted:
          ctx.msg,
      }
    );


    // ================================================================
    // SIMPAN WAKTU HANYA JIKA WELCOME BERHASIL DIKIRIM
    // ================================================================

    savePrivateWelcomeTime(
      ctx.from
    );


    if (
      welcomeStatus.isNew
    ) {
      console.log(
        '[PRIVATE WELCOME] Welcome pertama dikirim ke:',
        ctx.from
      );
    } else {
      console.log(
        '[PRIVATE WELCOME] Welcome mingguan dikirim ke:',
        ctx.from
      );
    }

  } catch (err) {
    console.error(
      '[PRIVATE WELCOME] Gagal mengirim welcome:',
      err.message
    );
  }
}


// ====================================================================
// ⚙️ AUTO FEATURES UTAMA
// ====================================================================

async function handleAutoFeatures(
  ctx
) {
  await handlePrivateWelcome(
    ctx
  );

  await handleGroupFeatures(
    ctx
  );
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = {
  handleAutoFeatures,
};