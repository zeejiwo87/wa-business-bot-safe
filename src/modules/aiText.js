const config = require('../config');

const userCooldown = new Map();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const COOLDOWN_MS = 8 * 1000;

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

function getText(msg) {
  const m = getContentMessage(msg);

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
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

function getQuotedText(msg) {
  const contextInfo = getContextInfo(msg);
  const quoted = contextInfo?.quotedMessage;

  if (!quoted) return '';

  return (
    quoted.conversation ||
    quoted.extendedTextMessage?.text ||
    quoted.imageMessage?.caption ||
    quoted.videoMessage?.caption ||
    quoted.documentMessage?.caption ||
    ''
  ).trim();
}

function getSenderJid(msg) {
  return msg.key?.participant || msg.participant || msg.key?.remoteJid || 'unknown';
}

function isOnCooldown(senderJid) {
  const now = Date.now();
  const lastUsed = userCooldown.get(senderJid) || 0;

  if (now - lastUsed < COOLDOWN_MS) {
    return true;
  }

  userCooldown.set(senderJid, now);

  setTimeout(() => {
    userCooldown.delete(senderJid);
  }, COOLDOWN_MS);

  return false;
}

function removeCommand(text, command) {
  return String(text || '')
    .replace(new RegExp(`^\\${command}\\s*`, 'i'), '')
    .trim();
}

function buildPrompt(command, input) {
  if (command === '.balas') {
    return {
      system:
        'Kamu adalah asisten WhatsApp yang membantu membuat balasan chat. ' +
        'Jawab dalam bahasa Indonesia yang natural, sopan, singkat, tidak kaku, dan tidak terdengar seperti AI. ' +
        'Jangan pakai pembuka seperti "Berikut balasannya". Langsung tulis pesan yang siap dikirim.',
      user:
        `Buatkan balasan WhatsApp untuk pesan/konteks berikut:\n\n${input}`,
    };
  }

  if (command === '.maaf') {
    return {
      system:
        'Kamu membantu membuat pesan minta maaf yang tulus. ' +
        'Bahasanya harus natural, hangat, tidak berlebihan, tidak manipulatif, dan siap dikirim via WhatsApp. ' +
        'Jangan pakai pembuka penjelasan. Langsung tulis pesannya.',
      user:
        `Buatkan pesan minta maaf berdasarkan masalah berikut:\n\n${input}`,
    };
  }

  if (command === '.romantis') {
    return {
      system:
        'Kamu membantu membuat pesan romantis pendek untuk pasangan. ' +
        'Bahasanya manis, tulus, tidak norak, tidak terlalu lebay, dan cocok dikirim via WhatsApp. ' +
        'Jangan pakai pembuka penjelasan. Langsung tulis pesannya.',
      user:
        `Buatkan pesan romantis dengan tema/konteks berikut:\n\n${input}`,
    };
  }

  return null;
}

async function callGroq(systemPrompt, userPrompt) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY belum diisi di file .env');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 350,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `Groq error HTTP ${response.status}`;

    throw new Error(message);
  }

  const output = data?.choices?.[0]?.message?.content;

  if (!output) {
    throw new Error('Groq tidak mengembalikan jawaban.');
  }

  return output.trim();
}

async function handleAITextCommand(sock, msg) {
  if (!msg?.message) return false;

  const text = getText(msg);
  const lower = text.toLowerCase();

  const commands = ['.balas', '.maaf', '.romantis'];
  const command = commands.find((cmd) => lower === cmd || lower.startsWith(`${cmd} `));

  if (!command) return false;

  const from = msg.key.remoteJid;
  const senderJid = getSenderJid(msg);

  if (isOnCooldown(senderJid)) {
    await sock.sendMessage(
      from,
      {
        text: '⏳ Tunggu sebentar ya, fitur AI jangan terlalu cepat dipakai.',
      },
      { quoted: msg }
    );

    return true;
  }

  let input = removeCommand(text, command);

  if (!input) {
    input = getQuotedText(msg);
  }

  if (!input) {
    await sock.sendMessage(
      from,
      {
        text:
          `❌ Masukkan teksnya dulu.\n\n` +
          `Contoh:\n` +
          `${command} aku lupa balas chat dia dari kemarin\n\n` +
          `Atau reply pesan orang, lalu ketik:\n` +
          `${command}`,
      },
      { quoted: msg }
    );

    return true;
  }

  if (input.length > 2500) {
    await sock.sendMessage(
      from,
      {
        text: '❌ Teksnya terlalu panjang. Maksimal sekitar 2500 karakter ya.',
      },
      { quoted: msg }
    );

    return true;
  }

  const prompt = buildPrompt(command, input);

  try {
    await sock.sendMessage(
      from,
      {
        react: {
          text: '⏳',
          key: msg.key,
        },
      }
    ).catch(() => {});

    const result = await callGroq(prompt.system, prompt.user);

    await sock.sendMessage(
      from,
      {
        text: result,
      },
      { quoted: msg }
    );

    await sock.sendMessage(
      from,
      {
        react: {
          text: '✅',
          key: msg.key,
        },
      }
    ).catch(() => {});

    return true;
  } catch (err) {
    console.error('[AI TEXT ERROR]', err);

    await sock.sendMessage(
      from,
      {
        text:
          '❌ AI sedang gagal merespons.\n\n' +
          `Error: ${err.message}`,
      },
      { quoted: msg }
    );

    await sock.sendMessage(
      from,
      {
        react: {
          text: '❌',
          key: msg.key,
        },
      }
    ).catch(() => {});

    return true;
  }
}

module.exports = {
  handleAITextCommand,
};