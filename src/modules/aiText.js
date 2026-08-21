const db = require('../db');
const config = require('../config');
const { rupiah, isOwner } = require('../utils/format');

const userCooldown = new Map();
const autoReplyCooldown = new Map();
const businessSessions = new Map();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

const COOLDOWN_MS = 8 * 1000;
const AUTO_REPLY_COOLDOWN_MS = 1500;

const BUSINESS_SESSION_TTL_MS = 30 * 60 * 1000;
const BUSINESS_HISTORY_LIMIT = 8;


// ====================================================================
// 🔘 DATABASE SETTING AI
// ====================================================================

db.prepare(`
  CREATE TABLE IF NOT EXISTS ai_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL
  )
`).run();


function isAutoAIEnabled() {
  const row = db
    .prepare(`
      SELECT setting_value
      FROM ai_settings
      WHERE setting_key = ?
    `)
    .get('auto_ai_enabled');

  if (!row) {
    db.prepare(`
      INSERT INTO ai_settings (
        setting_key,
        setting_value
      )
      VALUES (?, ?)
    `).run(
      'auto_ai_enabled',
      '1'
    );

    return true;
  }

  return row.setting_value === '1';
}


function setAutoAIEnabled(enabled) {
  db.prepare(`
    INSERT INTO ai_settings (
      setting_key,
      setting_value
    )
    VALUES (?, ?)

    ON CONFLICT(setting_key)
    DO UPDATE SET
      setting_value = excluded.setting_value
  `).run(
    'auto_ai_enabled',
    enabled ? '1' : '0'
  );
}


// ====================================================================
// 📦 UNWRAP MESSAGE
// ====================================================================

function getContentMessage(msg) {
  let current = msg?.message || {};

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
      current
        .viewOnceMessageV2Extension
        ?.message
    ) {
      current =
        current
          .viewOnceMessageV2Extension
          .message;

      continue;
    }

    if (
      current
        .documentWithCaptionMessage
        ?.message
    ) {
      current =
        current
          .documentWithCaptionMessage
          .message;

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
// 📝 AMBIL TEXT
// ====================================================================

function getText(msg) {
  const m =
    getContentMessage(msg);

  return String(
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
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
      value?.contextInfo
    ) {
      return value.contextInfo;
    }
  }

  return null;
}


// ====================================================================
// 💬 QUOTED TEXT
// ====================================================================

function getQuotedText(msg) {
  const quoted =
    getContextInfo(msg)
      ?.quotedMessage;

  if (!quoted) {
    return '';
  }

  return getText({
    message: quoted,
  });
}


// ====================================================================
// 👤 SENDER JID
// ====================================================================

function getSenderJid(msg) {
  return (
    msg.key?.participant ||
    msg.participant ||
    msg.key?.remoteJid ||
    'unknown'
  );
}


// ====================================================================
// 🔤 NORMALIZE
// ====================================================================

function normalizeText(value) {
  return String(
    value || ''
  )
    .toLowerCase()
    .normalize('NFKD')
    .replace(
      /[^\p{L}\p{N}\s+]/gu,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}


// ====================================================================
// 📦 SAFE JSON
// ====================================================================

function safeJsonArray(value) {
  try {
    const parsed =
      JSON.parse(
        value || '[]'
      );

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}


// ====================================================================
// 📦 PRODUCTS
// ====================================================================

function getProducts() {
  return db
    .prepare(`
      SELECT
        key,
        name,
        category,
        variants_json,
        notes_json
      FROM products
      ORDER BY name ASC
    `)
    .all()
    .map((row) => ({
      ...row,

      variants:
        safeJsonArray(
          row.variants_json
        ),

      notes:
        safeJsonArray(
          row.notes_json
        ),
    }));
}


// ====================================================================
// 🛠️ SERVICES
// ====================================================================

function getServices() {
  return db
    .prepare(`
      SELECT
        key,
        name,
        min_price,
        max_price,
        unit,
        emoji,
        notes_json
      FROM services
      ORDER BY id ASC
    `)
    .all()
    .map((row) => ({
      ...row,

      notes:
        safeJsonArray(
          row.notes_json
        ),
    }));
}


// ====================================================================
// 🔎 MATCH NAMA PRODUK / JASA
// ====================================================================

function textMentionsItem(
  text,
  item
) {
  const normalized =
    normalizeText(text);

  const key =
    normalizeText(
      item?.key
    );

  const name =
    normalizeText(
      item?.name
    );

  return Boolean(
    (
      key &&
      normalized.includes(key)
    ) ||
    (
      name &&
      normalized.includes(name)
    )
  );
}


function findMatchedProducts(
  text,
  products = getProducts()
) {
  return products.filter(
    (product) =>
      textMentionsItem(
        text,
        product
      )
  );
}


function findMatchedServices(
  text,
  services = getServices()
) {
  return services.filter(
    (service) =>
      textMentionsItem(
        text,
        service
      )
  );
}


// ====================================================================
// 🔎 VARIANT PRODUCT
// ====================================================================

function extractVariantCodes(text) {
  const normalized =
    normalizeText(text);

  return new Set([
    ...(
      normalized.match(
        /\b\d+p\d+u\b/g
      ) || []
    ),

    ...(
      normalized.match(
        /\b\d+\s*user\b/g
      ) || []
    ),
  ]);
}


function findProductsByVariant(
  text,
  products = getProducts()
) {
  const normalized =
    normalizeText(text);

  const requestedCodes =
    extractVariantCodes(
      normalized
    );

  if (!normalized) {
    return [];
  }

  return products.filter(
    (product) => {
      return (
        product.variants || []
      ).some(
        (variant) => {
          const variantName =
            normalizeText(
              variant?.name
            );

          if (!variantName) {
            return false;
          }

          const variantCodes =
            extractVariantCodes(
              variantName
            );

          for (
            const code
            of requestedCodes
          ) {
            if (
              variantCodes.has(
                code
              )
            ) {
              return true;
            }
          }

          if (
            normalized.length >= 5 &&
            variantName.includes(
              normalized
            )
          ) {
            return true;
          }

          return false;
        }
      );
    }
  );
}


function uniqueProducts(
  products
) {
  return [
    ...new Map(
      products.map(
        (product) => [
          product.key,
          product,
        ]
      )
    ).values(),
  ];
}


// ====================================================================
// ⏳ COOLDOWN MANUAL
// ====================================================================

function isOnCooldown(
  senderJid
) {
  const now =
    Date.now();

  const lastUsed =
    userCooldown.get(
      senderJid
    ) || 0;

  if (
    now - lastUsed <
    COOLDOWN_MS
  ) {
    return true;
  }

  userCooldown.set(
    senderJid,
    now
  );

  setTimeout(() => {
    userCooldown.delete(
      senderJid
    );
  }, COOLDOWN_MS);

  return false;
}


// ====================================================================
// ⏳ COOLDOWN AUTO
// ====================================================================

function isAutoReplyCooldown(
  chatJid
) {
  const now =
    Date.now();

  const lastUsed =
    autoReplyCooldown.get(
      chatJid
    ) || 0;

  if (
    now - lastUsed <
    AUTO_REPLY_COOLDOWN_MS
  ) {
    return true;
  }

  autoReplyCooldown.set(
    chatJid,
    now
  );

  setTimeout(() => {
    autoReplyCooldown.delete(
      chatJid
    );
  }, AUTO_REPLY_COOLDOWN_MS);

  return false;
}


// ====================================================================
// 🧹 REMOVE COMMAND
// ====================================================================

function removeCommand(
  text,
  command
) {
  return String(
    text || ''
  )
    .replace(
      new RegExp(
        `^\\${command}\\s*`,
        'i'
      ),
      ''
    )
    .trim();
}


// ====================================================================
// ✍️ PROMPT COMMAND MANUAL
// ====================================================================

function buildPrompt(
  command,
  input
) {
  if (
    command === '.balas'
  ) {
    return {
      system:
        'Kamu adalah asisten WhatsApp yang membantu owner membuat balasan chat. ' +
        'Jawab dalam bahasa Indonesia yang natural, sopan, singkat, tidak kaku, dan tidak terdengar seperti AI. ' +
        'Jangan pakai pembuka seperti "Berikut balasannya". ' +
        'Langsung tulis pesan yang siap dikirim.',

      user:
        `Buatkan balasan WhatsApp untuk pesan/konteks berikut:\n\n${input}`,
    };
  }


  if (
    command === '.maaf'
  ) {
    return {
      system:
        'Kamu membantu membuat pesan minta maaf yang tulus. ' +
        'Bahasanya natural, hangat, tidak berlebihan, tidak manipulatif, dan siap dikirim via WhatsApp. ' +
        'Jangan pakai pembuka penjelasan. Langsung tulis pesannya.',

      user:
        `Buatkan pesan minta maaf berdasarkan masalah berikut:\n\n${input}`,
    };
  }


  if (
    command === '.romantis'
  ) {
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


// ====================================================================
// 🧠 BUSINESS SESSION
// ====================================================================

function getBusinessSession(
  chatJid
) {
  const session =
    businessSessions.get(
      chatJid
    );

  if (!session) {
    return null;
  }

  if (
    Date.now() -
      session.updatedAt >
    BUSINESS_SESSION_TTL_MS
  ) {
    clearTimeout(
      session.timer
    );

    businessSessions.delete(
      chatJid
    );

    return null;
  }

  return session;
}


function saveBusinessTurn(
  chatJid,
  customerText,
  botText
) {
  const existing =
    getBusinessSession(
      chatJid
    );

  const history =
    existing?.history
      ? [...existing.history]
      : [];


  history.push({
    role: 'customer',

    text:
      String(
        customerText || ''
      ).trim(),
  });


  history.push({
    role: 'admin',

    text:
      String(
        botText || ''
      ).trim(),
  });


  if (
    existing?.timer
  ) {
    clearTimeout(
      existing.timer
    );
  }


  const timer =
    setTimeout(() => {
      businessSessions.delete(
        chatJid
      );
    }, BUSINESS_SESSION_TTL_MS);


  businessSessions.set(
    chatJid,
    {
      history:
        history.slice(
          -BUSINESS_HISTORY_LIMIT
        ),

      updatedAt:
        Date.now(),

      timer,
    }
  );
}


function getBusinessHistoryText(
  chatJid
) {
  const session =
    getBusinessSession(
      chatJid
    );

  if (
    !session?.history?.length
  ) {
    return '';
  }


  return session.history
    .map((item) => {
      const label =
        item.role === 'customer'
          ? 'Customer'
          : 'Admin';

      return `${label}: ${item.text}`;
    })
    .join('\n');
}


// ====================================================================
// 🔎 BUSINESS KEYWORDS
// ====================================================================

function hasStrongBusinessKeyword(
  text
) {
  const normalized =
    normalizeText(text);


  const keywords = [
    // Harga
    'harga',
    'berapa harga',
    'berapa harganya',
    'berapa biaya',
    'biaya',
    'pricelist',
    'price list',

    // Produk / jasa
    'produk',
    'jasa',
    'layanan',
    'katalog',
    'catalog',
    'premium',
    'aplikasi premium',
    'paket',

    // Variant
    '1p1u',
    '1p2u',
    'sharing',
    'private',
    'semi private',
    'member',
    'designer',
    'invite',
    'otp',
    'akun',

    // Availability
    'ready',
    'tersedia',
    'stok',
    'stock',
    'masih ada',

    // Garansi / problem
    'garansi',
    'refund',
    'error',
    'kendala',
    'login',
    'logout',

    // Order
    'order',
    'cara order',
    'cara pesan',
    'pesan',
    'beli',
    'mau beli',
    'mau order',
    'proses order',

    // Pembayaran
    'bayar',
    'bayarnya',
    'bayar kemana',
    'bayar ke mana',
    'pembayaran',
    'payment',
    'cara bayar',
    'transfer',
    'transfer kemana',
    'transfer ke mana',
    'rekening',
    'nomor rekening',
    'qris',
    'qr code',
    'gopay',
    'seabank',
    'e wallet',
    'ewallet',
    'bukti bayar',
    'bukti transfer',

    // Jasa
    'pengerjaan',
    'berapa lama pengerjaan',
    'lama pengerjaan',
    'selesai kapan',
    'revisi',
    'deadline',
    'proofreading',
    'formatting',
    'format',
    'halaman',
    'tugas',

    // Nama jasa umum
    'makalah',
    'skripsi',
    'jurnal',
    'artikel',
    'proposal',
    'laporan',
    'surat',
    'ketik',
    'desain',
    'ppt',
    'presentasi',
  ];


  return keywords.some(
    (keyword) =>
      normalized.includes(
        keyword
      )
  );
}


// ====================================================================
// 🗣️ NATURAL BUSINESS QUESTION
// ====================================================================

function looksLikeNaturalBusinessQuestion(
  text
) {
  const normalized =
    normalizeText(text);


  const patterns = [
    /\b(jual|punya|ada) apa (aja|saja)\b/,

    /\b(bisa|boleh) bantu (buat|ngerjain|kerjain)\b/,

    /\b(bisa|boleh) buat (makalah|skripsi|jurnal|artikel|proposal|laporan|surat|ppt|presentasi|desain)\b/,

    /\b(mau|ingin) pesan\b/,

    /\b(mau|ingin) order\b/,

    /\b(mau|ingin) beli\b/,

    /\bberapa (hari|bulan|tahun)\b/,

    /\bberapa lama (proses|pengerjaan)\b/,

    /\bmetode pembayaran\b/,

    /\bbayar ke mana\b/,

    /\btransfer ke mana\b/,
  ];


  return patterns.some(
    (pattern) =>
      pattern.test(
        normalized
      )
  );
}


// ====================================================================
// 🎯 APAKAH BUSINESS QUESTION?
// ====================================================================

function isBusinessQuestion(
  text,
  chatJid
) {
  const rawText =
    String(
      text || ''
    ).trim();


  if (
    !rawText ||
    rawText.startsWith('.')
  ) {
    return false;
  }


  const products =
    getProducts();

  const services =
    getServices();


  if (
    findMatchedProducts(
      rawText,
      products
    ).length > 0
  ) {
    return true;
  }


  if (
    findProductsByVariant(
      rawText,
      products
    ).length > 0
  ) {
    return true;
  }


  if (
    findMatchedServices(
      rawText,
      services
    ).length > 0
  ) {
    return true;
  }


  if (
    hasStrongBusinessKeyword(
      rawText
    )
  ) {
    return true;
  }


  if (
    looksLikeNaturalBusinessQuestion(
      rawText
    )
  ) {
    return true;
  }


  // Kalau sebelumnya sedang bahas bisnis,
  // tetap kirim follow-up ke Gemini.
  if (
    getBusinessSession(
      chatJid
    )
  ) {
    return true;
  }


  return false;
}


// ====================================================================
// 📦 FORMAT PRODUCT
// ====================================================================

function formatProduct(
  product
) {
  const variants =
    Array.isArray(
      product.variants
    )
      ? product.variants
      : [];


  const variantLines =
    variants.length
      ? variants
          .map(
            (variant) => {
              const price =
                variant?.price ===
                  null ||
                variant?.price ===
                  undefined
                  ? 'Hubungi admin untuk harga terbaru'
                  : rupiah(
                      variant.price
                    );

              return (
                `- ${variant?.name || 'Paket'}: ` +
                price
              );
            }
          )
          .join('\n')
      : '- Belum ada paket tercatat';


  const noteLines =
    product.notes?.length
      ? product.notes
          .map(
            (note) =>
              `- ${note}`
          )
          .join('\n')
      : '- Tidak ada catatan tambahan';


  return [
    `PRODUK: ${product.name}`,

    `Kategori: ${
      product.category ||
      '-'
    }`,

    'Paket dan harga:',
    variantLines,

    'Catatan:',
    noteLines,
  ].join('\n');
}


// ====================================================================
// 🛠️ FORMAT SERVICE
// ====================================================================

function formatService(
  service
) {
  let priceText =
    'Hubungi admin';


  if (
    service.min_price !==
      null &&
    service.min_price !==
      undefined &&
    service.max_price !==
      null &&
    service.max_price !==
      undefined
  ) {
    if (
      Number(
        service.min_price
      ) ===
      Number(
        service.max_price
      )
    ) {
      priceText =
        rupiah(
          service.min_price
        );

    } else {
      priceText =
        `${rupiah(
          service.min_price
        )} - ${rupiah(
          service.max_price
        )}`;
    }

  } else if (
    service.min_price !==
      null &&
    service.min_price !==
      undefined
  ) {
    priceText =
      `Mulai ${rupiah(
        service.min_price
      )}`;
  }


  const noteLines =
    service.notes?.length
      ? service.notes
          .map(
            (note) =>
              `- ${note}`
          )
          .join('\n')
      : '- Tidak ada catatan tambahan';


  return [
    `JASA: ${service.name}`,

    `Harga: ${priceText}`,

    `Satuan: ${
      service.unit ||
      '-'
    }`,

    'Catatan:',
    noteLines,
  ].join('\n');
}


// ====================================================================
// 💳 PAYMENT CONTEXT
// ====================================================================

function buildPaymentContext() {
  return [
    '=== METODE PEMBAYARAN ===',

    '',

    'GOPAY:',
    `Nomor: ${config.payment.gopayNumber}`,
    `Atas nama: ${config.payment.gopayName}`,

    '',

    'SEABANK:',
    `Nomor: ${config.payment.seabankNumber}`,
    `Atas nama: ${config.payment.seabankName}`,

    '',

    'QRIS:',
    'Tersedia. QRIS dapat dikirim oleh sistem/admin saat dibutuhkan.',

    '',

    'ATURAN PEMBAYARAN:',
    '- Jangan pernah mengarang nomor pembayaran.',
    '- Customer dapat membayar melalui GoPay, SeaBank, atau QRIS.',
    '- Setelah pembayaran, minta customer mengirim bukti pembayaran.',
  ].join('\n');
}


// ====================================================================
// 📚 BUILD BUSINESS CONTEXT
// ====================================================================

function buildBusinessContext(
  customerText,
  chatJid
) {
  const products =
    getProducts();

  const services =
    getServices();


  const historyText =
    getBusinessHistoryText(
      chatJid
    );


  const probeText = [
    historyText,
    customerText,
  ]
    .filter(Boolean)
    .join('\n');


  const matchedProducts =
    uniqueProducts([
      ...findMatchedProducts(
        probeText,
        products
      ),

      ...findProductsByVariant(
        probeText,
        products
      ),
    ]);


  const matchedServices =
    findMatchedServices(
      probeText,
      services
    );


  const normalized =
    normalizeText(
      customerText
    );


  const asksGeneralCatalog =
    /\b(katalog|catalog|pricelist|price list|jual apa|punya apa|produk apa|premium apa)\b/.test(
      normalized
    );


  const asksGeneralServices =
    /\b(jasa apa|layanan apa|jasa yang ada|daftar jasa|semua jasa)\b/.test(
      normalized
    );


  let productsToUse =
    matchedProducts;

  let servicesToUse =
    matchedServices;


  if (
    asksGeneralCatalog &&
    productsToUse.length === 0
  ) {
    productsToUse =
      products;
  }


  if (
    asksGeneralServices &&
    servicesToUse.length === 0
  ) {
    servicesToUse =
      services;
  }


  const productText =
    productsToUse.length
      ? productsToUse
          .map(
            formatProduct
          )
          .join('\n\n')
      : 'Tidak ada produk spesifik yang teridentifikasi dari pesan ini.';


  const serviceText =
    servicesToUse.length
      ? servicesToUse
          .map(
            formatService
          )
          .join('\n\n')
      : 'Tidak ada jasa spesifik yang teridentifikasi dari pesan ini.';


  return [
    '=== DATA PRODUK ===',
    productText,

    '',

    '=== DATA JASA ===',
    serviceText,

    '',

    buildPaymentContext(),
  ].join('\n');
}


// ====================================================================
// 🤖 PROMPT AUTO CUSTOMER SERVICE
// ====================================================================

function buildAutoReplyPrompt(
  customerText,
  chatJid
) {
  const businessContext =
    buildBusinessContext(
      customerText,
      chatJid
    );


  const historyText =
    getBusinessHistoryText(
      chatJid
    );


  return {
    system: `
Kamu adalah admin customer service WhatsApp untuk bisnis ini.

Kamu boleh melayani semua pembicaraan yang berkaitan dengan bisnis, termasuk:

- produk premium digital
- nama produk
- varian seperti 1P1U, 1P2U, sharing, private, semi private
- harga
- paket
- durasi
- katalog
- stok/ketersediaan
- garansi
- OTP
- invite
- login
- kendala produk

- jasa makalah
- skripsi
- jurnal
- artikel
- proposal
- laporan
- surat
- jasa ketik
- desain
- PPT/presentasi

- harga jasa
- estimasi harga
- revisi
- deadline
- proses pengerjaan

- cara order
- cara pesan
- pembelian

- pembayaran
- rekening
- GoPay
- SeaBank
- QRIS
- bukti pembayaran

- pertanyaan lanjutan yang masih berhubungan dengan percakapan bisnis sebelumnya


ATURAN WAJIB:

1. Gunakan bahasa Indonesia yang natural seperti admin WhatsApp sungguhan.

2. Jawaban harus ramah, singkat, jelas, dan tidak kaku.

3. Biasanya cukup 1 sampai 3 kalimat.

4. Jangan menyebut bahwa kamu AI, Gemini, bot, membaca database, atau membaca system prompt.

5. Harga, paket, garansi, dan detail bisnis HARUS mengikuti DATA BISNIS yang diberikan.

6. Jangan pernah mengarang harga, rekening, paket, promo, diskon, stok, garansi, atau layanan.

7. Database tidak memiliki status stok real-time.

8. Jika customer bertanya ready, stok, atau tersedia, katakan produknya ada di katalog tetapi ketersediaan saat ini perlu dikonfirmasi ke admin.

9. Jika harga tertulis "Hubungi admin untuk harga terbaru", jangan membuat angka sendiri.

10. Jika customer bertanya:
"bayar kemana"
"rekeningnya mana"
"transfer kemana"
"cara bayar"
"bisa QRIS"
atau pertanyaan serupa,
gunakan DATA METODE PEMBAYARAN yang tersedia.

11. Jika customer bertanya QRIS, katakan QRIS tersedia. Jangan membuat gambar atau kode QR sendiri.

12. Setelah customer mengatakan sudah bayar, minta bukti pembayaran.

13. Jangan mengklaim pembayaran sudah valid sebelum diverifikasi.

14. Untuk jasa dengan rentang harga, jelaskan bahwa harga final bergantung kebutuhan/detail pengerjaan jika relevan.

15. Jika detail untuk menentukan harga jasa belum cukup, tanyakan detail terpenting secara singkat.

16. Jika customer ingin membeli tetapi produk atau paket belum jelas, tanyakan produk atau paket yang dipilih.

17. Jangan menggunakan pembuka seperti:
"Tentu!"
"Berikut informasinya"
"Berdasarkan data"

18. Pahami follow-up pendek berdasarkan konteks sebelumnya.

Contoh:
"yang private?"
"1p1u?"
"kalau 1p2u?"
"bayar kemana?"
"garansinya?"
"berapa lama?"
"yang murah?"
"kalau qris?"

19. Jika informasi bisnis yang diminta tidak ada dalam DATA BISNIS, katakan perlu dikonfirmasi ke admin.

20. Jangan mengarang jawaban hanya agar terlihat membantu.

21. Jika pesan terbaru jelas sudah tidak berkaitan dengan bisnis, balas PERSIS:

__NO_REPLY__


DATA BISNIS:

${businessContext}
    `.trim(),


    user: `
${
  historyText
    ? `PERCAKAPAN BISNIS SEBELUMNYA:
${historyText}

`
    : ''
}PESAN CUSTOMER TERBARU:
${customerText}

Balas sebagai admin WhatsApp.
    `.trim(),
  };
}


// ====================================================================
// 🌐 GEMINI
// ====================================================================

async function callGemini(
  systemPrompt,
  userPrompt,
  maxOutputTokens = 500
) {
  if (
    !GEMINI_API_KEY
  ) {
    throw new Error(
      'GEMINI_API_KEY belum diisi di file .env'
    );
  }


  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    `${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent`;


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      30000
    );


  try {
    const response =
      await fetch(
        url,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            'X-goog-api-key':
              GEMINI_API_KEY,
          },

          signal:
            controller.signal,

          body:
            JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text:
                      systemPrompt,
                  },
                ],
              },


              contents: [
                {
                  role:
                    'user',

                  parts: [
                    {
                      text:
                        userPrompt,
                    },
                  ],
                },
              ],


              generationConfig: {
                maxOutputTokens,

                thinkingConfig: {
                  thinkingLevel:
                    'minimal',
                },
              },
            }),
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => null
        );


    if (
      !response.ok
    ) {
      const message =
        data?.error?.message ||
        `Gemini error HTTP ${response.status}`;

      throw new Error(
        message
      );
    }


    const candidate =
      data?.candidates?.[0];


    if (
      !candidate
    ) {
      const blockReason =
        data
          ?.promptFeedback
          ?.blockReason;


      if (
        blockReason
      ) {
        throw new Error(
          `Gemini memblokir permintaan: ${blockReason}`
        );
      }


      throw new Error(
        'Gemini tidak mengembalikan jawaban.'
      );
    }


    const output =
      candidate
        ?.content
        ?.parts
        ?.map(
          (part) =>
            part?.text || ''
        )
        .join('')
        .trim();


    if (
      !output
    ) {
      throw new Error(
        `Gemini tidak mengembalikan teks. Finish reason: ${
          candidate?.finishReason ||
          'UNKNOWN'
        }`
      );
    }


    return output;

  } catch (err) {

    if (
      err.name ===
      'AbortError'
    ) {
      throw new Error(
        'Gemini terlalu lama merespons.'
      );
    }


    throw err;

  } finally {

    clearTimeout(
      timeout
    );
  }
}


// ====================================================================
// ✍️ MANUAL COMMAND AI
// ====================================================================

async function handleManualAICommand(
  sock,
  msg,
  text,
  command
) {
  const from =
    msg.key.remoteJid;


  const senderJid =
    getSenderJid(
      msg
    );


  if (
    isOnCooldown(
      senderJid
    )
  ) {
    await sock.sendMessage(
      from,
      {
        text:
          '⏳ Tunggu sebentar ya, fitur AI jangan terlalu cepat dipakai.',
      },
      {
        quoted:
          msg,
      }
    );


    return true;
  }


  let input =
    removeCommand(
      text,
      command
    );


  if (
    !input
  ) {
    input =
      getQuotedText(
        msg
      );
  }


  if (
    !input
  ) {
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
      {
        quoted:
          msg,
      }
    );


    return true;
  }


  if (
    input.length >
    2500
  ) {
    await sock.sendMessage(
      from,
      {
        text:
          '❌ Teksnya terlalu panjang. Maksimal sekitar 2500 karakter ya.',
      },
      {
        quoted:
          msg,
      }
    );


    return true;
  }


  const prompt =
    buildPrompt(
      command,
      input
    );


  try {
    await sock
      .sendMessage(
        from,
        {
          react: {
            text:
              '⏳',

            key:
              msg.key,
          },
        }
      )
      .catch(
        () => {}
      );


    const result =
      await callGemini(
        prompt.system,
        prompt.user,
        350
      );


    await sock.sendMessage(
      from,
      {
        text:
          result,
      },
      {
        quoted:
          msg,
      }
    );


    await sock
      .sendMessage(
        from,
        {
          react: {
            text:
              '✅',

            key:
              msg.key,
          },
        }
      )
      .catch(
        () => {}
      );


    return true;

  } catch (err) {

    console.error(
      '[GEMINI AI ERROR]',
      err
    );


    await sock.sendMessage(
      from,
      {
        text:
          `❌ AI sedang gagal merespons.\n\n` +
          `Error: ${err.message}`,
      },
      {
        quoted:
          msg,
      }
    );


    await sock
      .sendMessage(
        from,
        {
          react: {
            text:
              '❌',

            key:
              msg.key,
          },
        }
      )
      .catch(
        () => {}
      );


    return true;
  }
}


// ====================================================================
// 🤖 AUTO REPLY CUSTOMER
// ====================================================================

async function handleBusinessAutoReply(
  sock,
  msg,
  text
) {

  // ================================================================
  // AUTO AI MATI
  // ================================================================

  if (
    !isAutoAIEnabled()
  ) {
    return false;
  }


  // Pesan sendiri jangan auto-reply.
  if (
    msg.key?.fromMe
  ) {
    return false;
  }


  const from =
    msg.key?.remoteJid;


  if (
    !from
  ) {
    return false;
  }


  // Jangan grup.
  if (
    from.endsWith(
      '@g.us'
    )
  ) {
    return false;
  }


  // Jangan status.
  if (
    from ===
    'status@broadcast'
  ) {
    return false;
  }


  if (
    !isBusinessQuestion(
      text,
      from
    )
  ) {
    return false;
  }


  if (
    isAutoReplyCooldown(
      from
    )
  ) {
    return false;
  }


  const prompt =
    buildAutoReplyPrompt(
      text,
      from
    );


  try {
    console.log(
      '[GEMINI AUTO REPLY]',
      {
        from,
        text,
      }
    );


    const result =
      await callGemini(
        prompt.system,
        prompt.user,
        700
      );


    const cleanResult =
      String(
        result || ''
      ).trim();


    if (
      !cleanResult
    ) {
      return false;
    }


    if (
      cleanResult ===
      '__NO_REPLY__'
    ) {
      return false;
    }


    await sock.sendMessage(
      from,
      {
        text:
          cleanResult,
      },
      {
        quoted:
          msg,
      }
    );


    saveBusinessTurn(
      from,
      text,
      cleanResult
    );


    return true;

  } catch (err) {

    console.error(
      '[GEMINI AUTO REPLY ERROR]',
      err
    );


    return false;
  }
}


// ====================================================================
// 🚦 HANDLER UTAMA
// ====================================================================

async function handleAITextCommand(
  sock,
  msg
) {
  if (
    !msg?.message
  ) {
    return false;
  }


  const text =
    getText(
      msg
    );


  if (
    !text
  ) {
    return false;
  }


  const lower =
    text.toLowerCase();


  // ==================================================================
  // 🔘 CONTROL AI
  //
  // .aion
  // .aioff
  // .aistatus
  //
  // Hanya owner.
  // ==================================================================

  if (
    lower === '.aion' ||
    lower === '.aioff' ||
    lower === '.aistatus'
  ) {

    if (
      !isOwner(
        msg
      )
    ) {
      return false;
    }


    const from =
      msg.key.remoteJid;


    // ==============================================================
    // AI ON
    // ==============================================================

    if (
      lower === '.aion'
    ) {
      setAutoAIEnabled(
        true
      );


      await sock.sendMessage(
        from,
        {
          text:
            '🤖 *AI CUSTOMER SERVICE AKTIF* ✅\n\n' +
            'AI sekarang akan membalas otomatis pertanyaan customer tentang produk, jasa, harga, katalog, order, pembayaran, garansi, dan hal lain yang berkaitan dengan bisnis.',
        },
        {
          quoted:
            msg,
        }
      );


      return true;
    }


    // ==============================================================
    // AI OFF
    // ==============================================================

    if (
      lower === '.aioff'
    ) {
      setAutoAIEnabled(
        false
      );


      await sock.sendMessage(
        from,
        {
          text:
            '🤖 *AI CUSTOMER SERVICE NONAKTIF* ⛔\n\n' +
            'Customer tidak akan dibalas AI secara otomatis.\n\n' +
            'Command *.balas*, *.maaf*, dan *.romantis* tetap bisa digunakan.',
        },
        {
          quoted:
            msg,
        }
      );


      return true;
    }


    // ==============================================================
    // AI STATUS
    // ==============================================================

    if (
      lower === '.aistatus'
    ) {
      const enabled =
        isAutoAIEnabled();


      await sock.sendMessage(
        from,
        {
          text:
            enabled
              ? '🤖 AI Customer Service: *AKTIF* ✅'
              : '🤖 AI Customer Service: *NONAKTIF* ⛔',
        },
        {
          quoted:
            msg,
        }
      );


      return true;
    }
  }


  // ==================================================================
  // MANUAL AI COMMAND
  // ==================================================================

  const commands = [
    '.balas',
    '.maaf',
    '.romantis',
  ];


  const command =
    commands.find(
      (cmd) =>
        lower === cmd ||
        lower.startsWith(
          `${cmd} `
        )
    );


  if (
    command
  ) {
    if (
      !isOwner(
        msg
      )
    ) {
      return false;
    }


    return handleManualAICommand(
      sock,
      msg,
      text,
      command
    );
  }


  // ==================================================================
  // AUTO CUSTOMER SERVICE
  // ==================================================================

  return handleBusinessAutoReply(
    sock,
    msg,
    text
  );
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = {
  handleAITextCommand,
};