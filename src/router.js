const config = require('./config');
const { pickText, jid, getSenderNumber, isOwner } = require('./utils/format');

const menu = require('./commands/menu');
const catalog = require('./commands/catalog');
const jasa = require('./commands/jasa');
const payment = require('./commands/payment');
const { order, status, cancel } = require('./commands/order');
const { admin, setlog } = require('./commands/admin');
const reset = require('./commands/reset');
const edit = require('./commands/edit');
const { handlePendingEdit } = require('./commands/edit');
const grup = require('./commands/grup');
const { addtext, deltext, findCustomTextByMessage } = require('./commands/addtext');
const { me, commandList } = require('./commands/profile');
const googleimage = require('./commands/googleimage');
const ping = require('./commands/ping');
const { gempa, cuaca } = require('./commands/bmkg');

const { handleAutoFeatures } = require('./modules/autoFeatures');
const { logAudit, getSetting } = require('./modules/orderService');

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

function isGroupJid(jidValue) {
  return String(jidValue || '').endsWith('@g.us');
}

async function route(sock, msg) {
  const text = pickText(msg) || '';
  const from = msg.key.remoteJid;

  if (!from) return;

  const ctx = {
    sock,
    msg,
    from,
    args: [],
    argsText: '',
    text,
    reply: (message) => sock.sendMessage(from, { text: message }, { quoted: msg }),
    notifyOwner: (message) => sock.sendMessage(jid(config.ownerNumber), { text: message }),
  };

  // Debug grup: nanti lihat di PowerShell apakah pesan grup kebaca bot atau tidak
  if (isGroupJid(from)) {
    console.log('[GROUP IN]', {
      group: from,
      participant: msg.key.participant || msg.participant || '-',
      fromMe: msg.key.fromMe,
      text,
    });
  }

  // Fitur otomatis diproses dulu:
  // 1. Auto reply kalau bot/owner ditag di grup aktif
  // 2. Reminder kalau pesan owner di grup belum dibalas
  // 3. Welcome chat pribadi reset 5 jam
  try {
    await handleAutoFeatures(ctx);
  } catch (err) {
    console.error('[AUTO FEATURE ERROR]', err);
  }

  // Fitur edit harga interaktif
  // Contoh: setelah .edit harga canva, admin cukup balas "1 7000"
  const pendingHandled = await handlePendingEdit(ctx);
  if (pendingHandled) return;

  const commandTextRaw = text.trim();

  if (!commandTextRaw) return;

  let commandText = commandTextRaw;

  // Support "menu" tanpa titik untuk customer baru
  if (!commandText.startsWith(config.prefix)) {
    const lowerText = commandText.toLowerCase();

    if (lowerText === 'menu' || lowerText === 'help') {
      commandText = `${config.prefix}${lowerText}`;
    } else {
      // Custom text hanya bisa dipanggil oleh owner
      // Contoh owner ketik: love you
      // Orang lain ketik: love you → bot diam
      if (!isOwner(ctx.msg)) return;

      const customText = findCustomTextByMessage(commandTextRaw);

      if (customText) {
        return ctx.reply(customText.response_text);
      }

      return;
    }
  }

  const [cmdRaw, ...args] = commandText
    .slice(config.prefix.length)
    .trim()
    .split(/\s+/);

  const cmd = (cmdRaw || '').toLowerCase();
  const handler = commands[cmd];

  if (!handler) return;

  ctx.args = args;
  ctx.argsText = args.join(' ');

  if (getSetting('log_order_messages', 'on') === 'on') {
    logAudit({
      eventType: 'command',
      userJid: from,
      userNumber: getSenderNumber(msg),
      content: text,
    });
  }

  await handler(ctx);
}

module.exports = route;