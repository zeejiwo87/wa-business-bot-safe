const os = require('os');
const config = require('../config');

function formatUptime(seconds) {
  const totalSeconds = Math.floor(Number(seconds) || 0);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const parts = [];

  if (days) parts.push(`${days} hari`);
  if (hours) parts.push(`${hours} jam`);
  if (minutes) parts.push(`${minutes} menit`);
  parts.push(`${secs} detik`);

  return parts.join(' ');
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  const mb = value / 1024 / 1024;
  const gb = value / 1024 / 1024 / 1024;

  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }

  return `${mb.toFixed(2)} MB`;
}

function getMessageTimestampMs(msg) {
  let timestamp = msg.messageTimestamp;

  if (!timestamp) return Date.now();

  if (typeof timestamp === 'object') {
    if (typeof timestamp.toNumber === 'function') {
      timestamp = timestamp.toNumber();
    } else if (typeof timestamp.toString === 'function') {
      timestamp = Number(timestamp.toString());
    } else {
      timestamp = Number(timestamp.low || Date.now() / 1000);
    }
  }

  timestamp = Number(timestamp);

  if (!Number.isFinite(timestamp)) return Date.now();

  // WhatsApp biasanya pakai detik, bukan milidetik
  if (timestamp < 10000000000) {
    return timestamp * 1000;
  }

  return timestamp;
}

function getServerTime() {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: config.tz || 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(new Date());
}

function getRamInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const percent = total > 0 ? (used / total) * 100 : 0;

  return {
    total,
    free,
    used,
    percent,
  };
}

function getBotMemoryInfo() {
  const memory = process.memoryUsage();

  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    external: memory.external,
  };
}

function getCpuInfo() {
  const cpus = os.cpus() || [];
  const model = cpus[0]?.model || '-';
  const cores = cpus.length || 0;
  const load = os.loadavg();

  return {
    model,
    cores,
    load1: load[0] || 0,
    load5: load[1] || 0,
    load15: load[2] || 0,
  };
}

async function ping(ctx) {
  const start = Date.now();

  const messageLatency = Math.max(0, Date.now() - getMessageTimestampMs(ctx.msg));
  const botMemory = getBotMemoryInfo();
  const ram = getRamInfo();
  const cpu = getCpuInfo();

  const text = `🏓 *PONG! BOT AKTIF*

⚡ *Latency Pesan:* ${messageLatency} ms
🚀 *Response Time:* menghitung...
⏱️ *Uptime Bot:* ${formatUptime(process.uptime())}
🖥️ *Uptime Server:* ${formatUptime(os.uptime())}

💾 *RAM Bot:* ${formatBytes(botMemory.rss)}
📦 *Heap Used:* ${formatBytes(botMemory.heapUsed)} / ${formatBytes(botMemory.heapTotal)}
🧠 *RAM Server:* ${formatBytes(ram.used)} / ${formatBytes(ram.total)}
📊 *RAM Usage:* ${ram.percent.toFixed(2)}%

⚙️ *CPU Core:* ${cpu.cores}
📈 *CPU Load:* ${cpu.load1.toFixed(2)}, ${cpu.load5.toFixed(2)}, ${cpu.load15.toFixed(2)}

🌐 *Hostname:* ${os.hostname()}
🧩 *Platform:* ${os.platform()} ${os.arch()}
🟢 *Node.js:* ${process.version}
🔢 *PID:* ${process.pid}
🕒 *Server Time:* ${getServerTime()}

✅ ${config.botName} berjalan normal.`;

  const sent = await ctx.sock.sendMessage(
    ctx.from,
    { text },
    { quoted: ctx.msg }
  );

  const responseTime = Date.now() - start;

  // Kirim update response time agar angkanya benar-benar dihitung setelah sendMessage selesai
  await ctx.sock.sendMessage(
    ctx.from,
    {
      text: `🚀 *Response Time:* ${responseTime} ms`,
    },
    { quoted: sent }
  );
}

module.exports = ping;