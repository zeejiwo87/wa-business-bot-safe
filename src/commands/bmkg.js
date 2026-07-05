const BMKG = require('bmkg-wrapper').default;
const config = require('../config');

const bmkg = new BMKG();

function clean(value, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function parseLocation(argsText) {
  return String(argsText || '')
    .trim()
    .replace(/^:/, '')
    .trim();
}

function splitLongMessage(text, maxLength = 3500) {
  const lines = String(text || '').split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;

    if (next.length > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

async function sendLongText(ctx, text) {
  const chunks = splitLongMessage(text);

  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

function formatAutoGempa(gempaData) {
  return `🌏 *BMKG - GEMPA TERBARU*

*Tanggal:* ${clean(gempaData.tanggal)}
*Jam:* ${clean(gempaData.jam)}
*DateTime:* ${clean(gempaData.dateTime)}
*Koordinat:* ${clean(gempaData.coordinates)}
*Lintang:* ${clean(gempaData.lintang)}
*Bujur:* ${clean(gempaData.bujur)}
*Magnitudo:* ${clean(gempaData.magnitude)}
*Kedalaman:* ${clean(gempaData.kedalaman)}
*Wilayah:* ${clean(gempaData.wilayah)}
*Potensi:* ${clean(gempaData.potensi)}
*Dirasakan:* ${clean(gempaData.dirasakan)}

Sumber data: BMKG`;
}

function formatGempaItem(item, index) {
  const lines = [
    `*${index + 1}. ${clean(item.wilayah)}*`,
    `Tanggal: ${clean(item.tanggal)}`,
    `Jam: ${clean(item.jam)}`,
    `Magnitudo: ${clean(item.magnitude)}`,
    `Kedalaman: ${clean(item.kedalaman)}`,
    `Koordinat: ${clean(item.coordinates)}`,
    `Lintang: ${clean(item.lintang)}`,
    `Bujur: ${clean(item.bujur)}`,
  ];

  if (item.potensi) {
    lines.push(`Potensi: ${clean(item.potensi)}`);
  }

  if (item.dirasakan) {
    lines.push(`Dirasakan: ${clean(item.dirasakan)}`);
  }

  return lines.join('\n');
}

function formatGempaList(title, list) {
  if (!Array.isArray(list) || !list.length) {
    return `${title}\n\nTidak ada data.`;
  }

  return `${title}

${list.map(formatGempaItem).join('\n\n')}

Sumber data: BMKG`;
}

function flattenCuaca(cuacaGroups) {
  if (!Array.isArray(cuacaGroups)) return [];

  return cuacaGroups
    .flat(Infinity)
    .filter((item) => item && typeof item === 'object');
}

function getDateLabel(localDatetime) {
  const value = clean(localDatetime, '');
  if (!value) return 'Tanggal tidak diketahui';

  return value.slice(0, 10);
}

function getTimeLabel(localDatetime) {
  const value = clean(localDatetime, '');
  if (!value) return '-';

  const time = value.split(' ')[1] || value.split('T')[1] || '';
  return time.slice(0, 5) || '-';
}

function groupWeatherByDate(items) {
  const grouped = new Map();

  for (const item of items) {
    const date = getDateLabel(item.local_datetime || item.datetime);

    if (!grouped.has(date)) {
      grouped.set(date, []);
    }

    grouped.get(date).push(item);
  }

  return grouped;
}

function formatWeatherItem(item) {
  const time = getTimeLabel(item.local_datetime || item.datetime);
  const weather = clean(item.weather_desc || item.weather_desc_en);
  const temp = clean(item.t);
  const humidity = clean(item.hu);
  const windDirection = clean(item.wd);
  const windSpeed = clean(item.ws);
  const visibility = clean(item.vs_text);

  return `• ${time} — ${weather}, ${temp}°C, kelembapan ${humidity}%, angin ${windDirection} ${windSpeed}, jarak pandang ${visibility}`;
}

function formatCuaca(data, kelurahan) {
  const lokasi = data?.lokasi || {};
  const items = flattenCuaca(data?.cuaca);
  const grouped = groupWeatherByDate(items);

  if (!items.length) {
    return `🌦️ *BMKG - PRAKIRAAN CUACA*

Tidak ada data cuaca untuk: *${kelurahan}*`;
  }

  const locationText = [
    clean(lokasi.desa, kelurahan),
    clean(lokasi.kecamatan, ''),
    clean(lokasi.kotkab, ''),
    clean(lokasi.provinsi, ''),
  ]
    .filter(Boolean)
    .filter((item) => item !== '-')
    .join(', ');

  let text = `🌦️ *BMKG - PRAKIRAAN CUACA 3 HARI*

*Lokasi:* ${locationText || kelurahan}
*Timezone:* ${clean(lokasi.timezone)}

`;

  for (const [date, weatherItems] of grouped.entries()) {
    text += `📅 *${date}*\n`;
    text += `${weatherItems.map(formatWeatherItem).join('\n')}\n\n`;
  }

  text += 'Sumber data: BMKG';

  return text.trim();
}

async function gempa(ctx) {
  try {
    await ctx.reply('🌏 Mengambil data gempa dari BMKG...');

    const [autoGempa, gempaDirasakan, gempaTerkini] = await Promise.all([
      bmkg.autoGempa(),
      bmkg.gempaDirasakan(),
      bmkg.gempaTerkini(),
    ]);

    await sendLongText(ctx, formatAutoGempa(autoGempa));

    if (autoGempa?.shakemap) {
      try {
        await ctx.sock.sendMessage(
          ctx.from,
          {
            image: { url: autoGempa.shakemap },
            caption: '🗺️ Shakemap gempa terbaru BMKG',
          },
          { quoted: ctx.msg }
        );
      } catch (err) {
        await ctx.reply(`Shakemap tersedia, tapi gagal dikirim sebagai gambar:\n${autoGempa.shakemap}`);
      }
    }

    await sendLongText(
      ctx,
      formatGempaList('📍 *BMKG - DAFTAR GEMPA DIRASAKAN*', gempaDirasakan)
    );

    await sendLongText(
      ctx,
      formatGempaList('📌 *BMKG - DAFTAR GEMPA TERKINI M 5.0+*', gempaTerkini)
    );
  } catch (err) {
    await ctx.reply(`Gagal mengambil data gempa BMKG.\n\nPenyebab:\n${err.message}`);
  }
}

async function cuaca(ctx) {
  const kelurahan = parseLocation(ctx.argsText) || config.bmkgDefaultKelurahan || 'Lebak Bulus';

  try {
    await ctx.reply(`🌦️ Mengambil prakiraan cuaca BMKG untuk: *${kelurahan}*`);

    const data = await bmkg.prakiraanCuaca(kelurahan);
    await sendLongText(ctx, formatCuaca(data, kelurahan));
  } catch (err) {
    await ctx.reply(
      `Gagal mengambil prakiraan cuaca BMKG untuk: *${kelurahan}*.\n\nPenyebab:\n${err.message}\n\nCoba pakai format:\n.cuaca : Lebak Bulus`
    );
  }
}

module.exports = {
  gempa,
  cuaca,
};