const config = require('./config');
const db = require('./db');

const {
  pickText,
  jid,
  getSenderNumber,
  isOwner,
} = require('./utils/format');

const menu = require('./commands/menu');
const payment = require('./commands/payment');

const {
  setlog,
} = require('./commands/admin');

const reset = require('./commands/reset');
const grup = require('./commands/grup');

const {
  addtext,
  deltext,
  findCustomTextByMessage,
} = require('./commands/addtext');

const {
  me,
  commandList,
} = require('./commands/profile');

const googleimage = require('./commands/googleimage');
const ping = require('./commands/ping');

const {
  gempa,
  cuaca,
} = require('./commands/bmkg');

const {
  handleAutoFeatures,
} = require('./modules/autoFeatures');

const {
  logAudit,
  getSetting,
} = require('./modules/orderService');


// ====================================================================
// 📋 DAFTAR COMMAND
// ====================================================================

const commands = {
  menu,
  help: menu,

  command: commandList,
  commands: commandList,

  ping,
  me,
  googleimage,
  gempa,
  cuaca,

  payment,
  bayar: payment,

  setlog,
  reset,

  grup,
  group: grup,

  addtext,
  deltext,
};


// ====================================================================
// 👥 CEK JID GRUP
// ====================================================================

function isGroupJid(jidValue) {
  return String(
    jidValue || ''
  ).endsWith('@g.us');
}


// ====================================================================
// 👥 CEK STATUS FITUR GRUP
// ====================================================================

function groupFeatureEnabled(groupJid) {
  try {
    const row = db.prepare(`
      SELECT enabled
      FROM group_features
      WHERE group_jid = ?
    `).get(groupJid);

    return Number(
      row?.enabled
    ) === 1;
  } catch (err) {
    console.error(
      '[GROUP FEATURE CHECK ERROR]',
      err.message
    );

    // Kalau database error, anggap fitur grup mati.
    // Ini lebih aman agar bot tidak tiba-tiba aktif di grup.
    return false;
  }
}


// ====================================================================
// 🔍 AMBIL NAMA COMMAND DARI TEKS
// ====================================================================

function getCommandName(commandText) {
  const raw = String(
    commandText || ''
  ).trim();

  if (
    !raw.startsWith(
      config.prefix
    )
  ) {
    return '';
  }

  const body = raw
    .slice(config.prefix.length)
    .trim();

  if (!body) {
    return '';
  }

  return String(
    body.split(/\s+/)[0] || ''
  ).toLowerCase();
}


// ====================================================================
// 🔐 COMMAND YANG BOLEH LEWAT SAAT FITUR GRUP MATI
//
// Ketika .grup OFF:
//
// Semua pesan di grup diabaikan.
//
// Pengecualian:
// owner / akun bot sendiri tetap boleh memakai:
//
// .grup on
// .grup off
// .grup status
// .group ...
//
// Ini diperlukan agar fitur grup bisa dihidupkan kembali.
// ====================================================================

function isAllowedGroupControl(
  msg,
  commandText
) {
  if (
    !isOwner(msg) &&
    !msg?.key?.fromMe
  ) {
    return false;
  }

  const cmd =
    getCommandName(
      commandText
    );

  return (
    cmd === 'grup' ||
    cmd === 'group'
  );
}


// ====================================================================
// 🚦 ROUTER UTAMA
// ====================================================================

async function route(sock, msg) {
  if (!msg?.key) {
    return;
  }

  const text =
    pickText(msg) || '';

  const from =
    msg.key.remoteJid;

  if (!from) {
    return;
  }

  const isGroup =
    isGroupJid(from);

  const commandTextRaw =
    text.trim();


  // ==================================================================
  // CONTEXT COMMAND
  // ==================================================================

  const ctx = {
    sock,
    msg,
    from,

    args: [],
    argsText: '',

    text,

    reply: (message) =>
      sock.sendMessage(
        from,
        {
          text: String(message),
        },
        {
          quoted: msg,
        }
      ),

    notifyOwner: (message) =>
      sock.sendMessage(
        jid(config.ownerNumber),
        {
          text: String(message),
        }
      ),
  };


  // ==================================================================
  // 👥 DEBUG PESAN GRUP
  // ==================================================================

  if (isGroup) {
    console.log(
      '[GROUP IN]',
      {
        group: from,

        participant:
          msg.key.participant ||
          msg.participant ||
          '-',

        fromMe:
          Boolean(msg.key.fromMe),

        text,
      }
    );
  }


  // ==================================================================
  // 🔒 PENGAMAN GRUP
  //
  // Jika .grup OFF:
  //
  // ❌ jangan jalankan auto feature
  // ❌ jangan balas "menu"
  // ❌ jangan balas "help"
  // ❌ jangan jalankan .menu
  // ❌ jangan jalankan command lain
  // ❌ jangan jalankan custom text
  //
  // ✅ owner tetap boleh:
  //    .grup on
  //    .grup off
  //    .grup status
  // ==================================================================

  let isGroupEnabled = false;

  if (isGroup) {
    isGroupEnabled =
      groupFeatureEnabled(
        from
      );

    if (
      !isGroupEnabled &&
      !isAllowedGroupControl(
        msg,
        commandTextRaw
      )
    ) {
      return;
    }
  }


  // ==================================================================
  // ⚙️ FITUR OTOMATIS
  //
  // PRIVATE:
  // - welcome private chat
  //
  // GRUP:
  // - hanya berjalan jika .grup ON
  // ==================================================================

  if (
    !isGroup ||
    isGroupEnabled
  ) {
    try {
      await handleAutoFeatures(
        ctx
      );
    } catch (err) {
      console.error(
        '[AUTO FEATURE ERROR]',
        err
      );
    }
  }


  // ==================================================================
  // 📝 AMBIL COMMAND
  // ==================================================================

  if (!commandTextRaw) {
    return;
  }

  let commandText =
    commandTextRaw;


  // ==================================================================
  // 📋 SUPPORT "menu" / "help" TANPA PREFIX
  //
  // PRIVATE:
  // menu  → .menu
  // help  → .help
  //
  // GRUP + .grup ON:
  // menu  → .menu
  // help  → .help
  //
  // GRUP + .grup OFF:
  // sudah dihentikan oleh pengaman grup di atas
  // ==================================================================

  if (
    !commandText.startsWith(
      config.prefix
    )
  ) {
    const lowerText =
      commandText.toLowerCase();


    if (
      lowerText === 'menu' ||
      lowerText === 'help'
    ) {
      commandText =
        `${config.prefix}${lowerText}`;
    } else {

      // ==============================================================
      // CUSTOM TEXT
      //
      // Hanya owner yang boleh memanggil custom text.
      //
      // Jika berada di grup, bagian ini hanya bisa tercapai
      // apabila .grup ON.
      // ==============================================================

      if (
        !isOwner(
          ctx.msg
        )
      ) {
        return;
      }


      const customText =
        findCustomTextByMessage(
          commandTextRaw
        );


      if (customText) {
        return ctx.reply(
          customText.response_text
        );
      }


      return;
    }
  }


  // ==================================================================
  // 🔍 PARSE COMMAND
  // ==================================================================

  const commandBody =
    commandText
      .slice(config.prefix.length)
      .trim();


  if (!commandBody) {
    return;
  }


  const [
    cmdRaw,
    ...args
  ] = commandBody.split(
    /\s+/
  );


  const cmd =
    String(
      cmdRaw || ''
    ).toLowerCase();


  const handler =
    commands[cmd];


  if (!handler) {
    return;
  }


  ctx.args =
    args;

  ctx.argsText =
    args.join(' ');


  // ==================================================================
  // 📝 AUDIT COMMAND
  // ==================================================================

  try {
    if (
      getSetting(
        'log_order_messages',
        'on'
      ) === 'on'
    ) {
      logAudit({
        eventType: 'command',

        userJid: from,

        userNumber:
          getSenderNumber(
            msg
          ),

        content: text,
      });
    }
  } catch (err) {
    console.error(
      '[COMMAND AUDIT ERROR]',
      err
    );
  }


  // ==================================================================
  // 🚀 JALANKAN COMMAND
  // ==================================================================

  await handler(
    ctx
  );
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = route;