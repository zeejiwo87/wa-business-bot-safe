const config = require('./config');
const {
  pickText,
  jid,
  getSenderNumber,
  isOwner,
} = require('./utils/format');

const menu = require('./commands/menu');
const catalog = require('./commands/catalog');
const jasa = require('./commands/jasa');
const payment = require('./commands/payment');

const {
  order,
  status,
  cancel,
} = require('./commands/order');

const {
  admin,
  setlog,
} = require('./commands/admin');

const reset = require('./commands/reset');

const {
  handlePendingEdit,
} = require('./commands/edit');

const edit = require('./commands/edit');

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

  catalog,
  katalog: catalog,
  premium: catalog,

  jasa,
  tugas: jasa,
  joki: jasa,

  payment,
  bayar: payment,

  order,
  status,
  cancel,

  admin,
  setlog,
  reset,
  edit,

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

  if (isGroupJid(from)) {
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
  // ⚙️ FITUR OTOMATIS
  //
  // 1. Auto reply ketika bot/owner ditag di grup aktif
  // 2. Reminder pesan owner di grup
  // 3. Welcome private chat
  // ==================================================================

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


  // ==================================================================
  // ✏️ EDIT INTERAKTIF
  //
  // Contoh:
  // .edit harga canva
  // kemudian owner membalas:
  // 1 7000
  // ==================================================================

  try {
    const pendingHandled =
      await handlePendingEdit(
        ctx
      );

    if (pendingHandled) {
      return;
    }
  } catch (err) {
    console.error(
      '[PENDING EDIT ERROR]',
      err
    );
  }


  // ==================================================================
  // 📝 AMBIL COMMAND
  // ==================================================================

  const commandTextRaw =
    text.trim();

  if (!commandTextRaw) {
    return;
  }

  let commandText =
    commandTextRaw;


  // ==================================================================
  // 📋 SUPPORT "menu" / "help" TANPA PREFIX
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
      // Custom text hanya bisa dipanggil owner
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