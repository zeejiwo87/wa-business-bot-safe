const https = require('https');
const config = require('../config');
const { isOwner } = require('../utils/format');

function parseQuery(argsText) {
  return String(argsText || '')
    .trim()
    .replace(/^:/, '')
    .trim();
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);

            if (res.statusCode < 200 || res.statusCode >= 300) {
              const message = json?.error?.message || `HTTP Error ${res.statusCode}`;
              reject(new Error(message));
              return;
            }

            resolve(json);
          } catch (err) {
            reject(new Error('Gagal membaca response dari Google API.'));
          }
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

function buildGoogleImageSearchUrl(query) {
  const params = new URLSearchParams({
    key: config.googleApiKey,
    cx: config.googleCx,
    q: query,
    searchType: 'image',
    num: '3',
    safe: 'active',
  });

  return `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
}

async function fetchGoogleImages(query) {
  const url = buildGoogleImageSearchUrl(query);
  const data = await requestJson(url);

  return (data?.items || [])
    .map((item) => ({
      title: item.title || '',
      link: item.link || '',
      source: item.image?.contextLink || item.displayLink || '',
      mime: item.mime || '',
    }))
    .filter((item) => item.link);
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

  if (!config.googleApiKey || !config.googleCx) {
    return ctx.reply(
      `Google Image Search belum disetting.\n\nPastikan .env berisi:\nGOOGLE_API_KEY=isi_api_key\nGOOGLE_CX=isi_cx\n\nLalu restart bot:\npm2 restart wa-bot --update-env`
    );
  }

  let images = [];

  try {
    images = await fetchGoogleImages(query);
  } catch (err) {
    return ctx.reply(
      `Gagal mencari gambar di Google.\n\nPenyebab:\n${err.message}`
    );
  }

  if (!images.length) {
    return ctx.reply(
      `Tidak ada gambar yang ditemukan untuk: *${query}*`
    );
  }

  await ctx.reply(`🔎 Mengambil ${images.length} gambar teratas untuk: *${query}*`);

  for (const [index, image] of images.entries()) {
    const caption = `🖼️ *Google Image ${index + 1}/${images.length}*

*Query:* ${query}
*Judul:* ${image.title || '-'}
*Sumber:* ${image.source || '-'}`;

    try {
      await ctx.sock.sendMessage(
        ctx.from,
        {
          image: { url: image.link },
          caption,
        },
        { quoted: ctx.msg }
      );
    } catch (err) {
      await ctx.reply(
        `Gambar ${index + 1} gagal dikirim sebagai foto.\n\nLink gambar:\n${image.link}`
      );
    }
  }
}

module.exports = googleimage;