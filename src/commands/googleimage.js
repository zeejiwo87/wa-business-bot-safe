const https = require('https');
const config = require('../config');
const { isOwner } = require('../utils/format');

function parseQuery(argsText) {
  return String(argsText || '')
    .trim()
    .replace(/^:/, '')
    .trim();
}

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message =
              json?.message ||
              json?.error ||
              json?.error?.message ||
              `HTTP Error ${res.statusCode}`;

            reject(new Error(String(message)));
            return;
          }

          resolve(json);
        } catch (err) {
          reject(new Error('Gagal membaca response dari Serper API.'));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

async function fetchSerperImages(query) {
  const options = {
    hostname: 'google.serper.dev',
    path: '/images',
    method: 'POST',
    headers: {
      'X-API-KEY': config.serperApiKey,
      'Content-Type': 'application/json',
    },
  };

  const body = {
    q: query,
    gl: 'id',
    hl: 'id',
    num: 10,
  };

  const data = await requestJson(options, body);

  return (data?.images || [])
    .map((item) => ({
      title: item.title || '',
      imageUrl: item.imageUrl || item.thumbnailUrl || '',
      source: item.source || item.domain || item.link || '',
      link: item.link || '',
    }))
    .filter((item) => item.imageUrl)
    .slice(0, 3);
}

async function googleimage(ctx) {
  // Khusus owner. Kalau orang lain pakai command ini, bot diam.
  if (!isOwner(ctx.msg)) return;

  const query = parseQuery(ctx.argsText);

  if (!query) {
    return ctx.reply(
      `Format salah.\n\nContoh:\n*.googleimage : semeru*`
    );
  }

  if (!config.serperApiKey) {
    return ctx.reply(
      `Serper belum disetting.\n\nTambahkan ini di file .env:\nSERPER_API_KEY=isi_api_key_serper_kamu\n\nLalu restart bot:\npm2 restart wa-bot --update-env`
    );
  }

  let images = [];

  try {
    images = await fetchSerperImages(query);
  } catch (err) {
    return ctx.reply(
      `Gagal mencari gambar.\n\nPenyebab:\n${err.message}`
    );
  }

  if (!images.length) {
    return ctx.reply(
      `Tidak ada gambar yang ditemukan untuk: *${query}*`
    );
  }

  await ctx.reply(`🔎 Mengambil ${images.length} gambar teratas untuk: *${query}*`);

  for (const [index, image] of images.entries()) {
    const caption = `🖼️ *Image ${index + 1}/${images.length}*

*Query:* ${query}
*Judul:* ${image.title || '-'}
*Sumber:* ${image.source || '-'}`;

    try {
      await ctx.sock.sendMessage(
        ctx.from,
        {
          image: { url: image.imageUrl },
          caption,
        },
        { quoted: ctx.msg }
      );
    } catch (err) {
      await ctx.reply(
        `Gambar ${index + 1} gagal dikirim sebagai foto.\n\nLink gambar:\n${image.imageUrl}`
      );
    }
  }
}

module.exports = googleimage;