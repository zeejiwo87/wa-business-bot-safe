const https = require('https');
const BMKG = require('bmkg-wrapper').default;
const config = require('../config');

const bmkg = new BMKG();

const DEFAULT_ADM4 = config.bmkgDefaultAdm4 || '35.07.06.2012';
const DEFAULT_KELURAHAN = config.bmkgDefaultKelurahan || 'Tamansari';

const LOCATION_ALIASES = {
  // Desa kamu
  'tamansari': DEFAULT_ADM4,
  'desa tamansari': DEFAULT_ADM4,
  'tamansari ampelgading': DEFAULT_ADM4,
  'tamansari malang': DEFAULT_ADM4,
  'tamansari kabupaten malang': DEFAULT_ADM4,
  'tamansari jawa timur': DEFAULT_ADM4,

  // Kecamatan / Kabupaten kamu
  'ampelgading': DEFAULT_ADM4,
  'kecamatan ampelgading': DEFAULT_ADM4,
  'kabupaten malang': DEFAULT_ADM4,
  'kab malang': DEFAULT_ADM4,
  'malang kabupaten': DEFAULT_ADM4,
};

function clean(value, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/^:/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseLocation(argsText) {
  return String(argsText || '')
    .trim()
    .replace(/^:/, '')
    .trim();
}

function isAdm4Code(value) {
  return /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(String(value || '').trim());
}

function resolveCuacaTarget(argsText) {
  const raw = parseLocation(argsText);

  if (!raw) {
    return {
      mode: 'adm4',
      adm4: DEFAULT_ADM4,
      label: DEFAULT_KELURAHAN,
    };
  }

  const normalized = normalizeText(raw);
  const codeCandidate = raw
    .replace(/^kode\s+/i, '')
    .replace(/^adm4\s+/i, '')
    .trim();

  if (isAdm4Code(codeCandidate)) {
    return {
      mode: 'adm4',
      adm4: codeCandidate,
      label: codeCandidate,
    };
  }

  if (LOCATION_ALIASES[normalized]) {
    return {
      mode: 'adm4',
      adm4: LOCATION_ALIASES[normalized],
      label: raw,
    };
  }

  return {
    mode: 'name',
    query: raw,
    label: raw,
  };
}

function requestJsonGet(url) {
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
            reject(new Error('Gagal membaca response JSON dari BMKG.'));
          }
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
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

function extractLokasi(data) {
  if (data?.lokasi) return data.lokasi;

  if (Array.isArray(data?.data)) {
    const firstWithLocation = data.data.find((item) => item?.lokasi);
    if (firstWithLocation?.lokasi) return firstWithLocation.lokasi;
  }

  if (data?.data?.lokasi) return data.data.lokasi;

  return {};
}

function extractCuaca(data) {
  if (Array.isArray(data?.cuaca)) return data.cuaca;

  if (Array.isArray(data?.data)) {
    const firstWithCuaca = data.data.find((item) => Array.isArray(item?.cuaca));
    if (firstWithCuaca?.cuaca) return firstWithCuaca.cuaca;
  }

  if (Array.isArray(data?.data?.cuaca)) return data.data.cuaca;

  return [];
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

function formatWindSpeed(value) {
  if (value === null || value === undefined || value === '') return '-';

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return `${numeric} km/jam`;
  }

  return String(value);
}

function formatWeatherItem(item) {
  const time = getTimeLabel(item.local_datetime || item.datetime);
  const weather = clean(item.weather_desc || item.weather_desc_en);
  const temp = clean(item.t);
  const humidity = clean(item.hu);
  const windDirection = clean(item.wd);
  const windSpeed = formatWindSpeed(item.ws);
  const visibility = clean(item.vs_text);

  return `• ${time} — ${weather}, ${temp}°C, kelembapan ${humidity}%, angin ${windDirection} ${windSpeed}, jarak pandang ${visibility}`;
}

function formatCuaca(data, label) {
  const lokasi = extractLokasi(data);
  const items = flattenCuaca(extractCuaca(data));
  const grouped = groupWeatherByDate(items);

  if (!items.length) {
    return `🌦️ *BMKG - PRAKIRAAN CUACA*

Tidak ada data cuaca untuk: *${label}*`;
  }

  const locationText = [
    clean(lokasi.desa || lokasi.kelurahan, label),
    clean(lokasi.kecamatan, ''),
    clean(lokasi.kotkab || lokasi.kabupaten || lokasi.kota, ''),
    clean(lokasi.provinsi, ''),
  ]
    .filter(Boolean)
    .filter((item) => item !== '-')
    .join(', ');

  let text = `🌦️ *BMKG - PRAKIRAAN CUACA 3 HARI*

*Lokasi:* ${locationText || label}
*Timezone:* ${clean(lokasi.timezone)}

`;

  for (const [date, weatherItems] of grouped.entries()) {
    text += `📅 *${date}*\n`;
    text += `${weatherItems.map(formatWeatherItem).join('\n')}\n\n`;
  }

  text += 'Sumber data: BMKG';

  return text.trim();
}

async function fetchCuacaByAdm4(adm4) {
  const params = new URLSearchParams({
    adm4,
  });

  const url = `https://api.bmkg.go.id/publik/prakiraan-cuaca?${params.toString()}`;
  return requestJsonGet(url);
}

async function fetchCuacaByName(query) {
  return bmkg.prakiraanCuaca(query);
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
  const target = resolveCuacaTarget(ctx.argsText);

  try {
    await ctx.reply(`🌦️ Mengambil prakiraan cuaca BMKG untuk: *${target.label}*`);

    const data = target.mode === 'adm4'
      ? await fetchCuacaByAdm4(target.adm4)
      : await fetchCuacaByName(target.query);

    await sendLongText(ctx, formatCuaca(data, target.label));
  } catch (err) {
    await ctx.reply(
      `Gagal mengambil prakiraan cuaca BMKG untuk: *${target.label}*.

Penyebab:
${err.message}

Contoh yang aman:
.cuaca
.cuaca : Kabupaten Malang
.cuaca : Tamansari
.cuaca : 35.07.06.2012

Catatan:
Untuk desa/kelurahan yang namanya banyak, paling akurat pakai kode ADM4 BMKG.`
    );
  }
}

module.exports = {
  gempa,
  cuaca,
};