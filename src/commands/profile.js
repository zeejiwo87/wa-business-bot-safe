const config = require('../config');

const {
  isOwner,
  jid,
} = require('../utils/format');


// ====================================================================
// 📱 FORMAT NOMOR WHATSAPP
// ====================================================================

function formatPhoneNumber(number) {
  const clean =
    String(
      number || ''
    ).replace(
      /\D/g,
      ''
    );

  if (!clean) {
    return '-';
  }

  if (
    clean.startsWith('62')
  ) {
    return `+${clean}`;
  }

  if (
    clean.startsWith('0')
  ) {
    return `+62${clean.slice(1)}`;
  }

  return clean;
}


// ====================================================================
// 📷 FORMAT INSTAGRAM
// ====================================================================

function formatInstagramLink(value) {
  const raw =
    String(
      value || ''
    ).trim();

  if (!raw) {
    return '-';
  }

  const username =
    raw
      .replace(
        /^https?:\/\/(www\.)?instagram\.com\//i,
        ''
      )
      .replace(
        /^@/,
        ''
      )
      .replace(
        /\/$/,
        ''
      )
      .trim();

  if (!username) {
    return '-';
  }

  return (
    `https://www.instagram.com/${username}/`
  );
}


// ====================================================================
// 📝 AMBIL TEXT ABOUT
// ====================================================================

function extractAboutText(value) {
  if (!value) {
    return '';
  }


  if (
    typeof value === 'string'
  ) {
    return value.trim();
  }


  if (
    Array.isArray(value)
  ) {
    for (
      const item
      of value
    ) {
      const text =
        extractAboutText(
          item
        );

      if (text) {
        return text;
      }
    }

    return '';
  }


  if (
    typeof value === 'object'
  ) {
    const possibleKeys = [
      'status',
      'text',
      'about',
      'description',
      'message',
    ];


    for (
      const key
      of possibleKeys
    ) {
      const text =
        extractAboutText(
          value[key]
        );

      if (text) {
        return text;
      }
    }
  }


  return '';
}


// ====================================================================
// 🖼️ FOTO PROFILE
// ====================================================================

async function getProfilePhotoUrl(
  sock,
  targetJid
) {
  try {
    return await sock
      .profilePictureUrl(
        targetJid,
        'image'
      );

  } catch (err) {
    return null;
  }
}


// ====================================================================
// 📝 WHATSAPP ABOUT
// ====================================================================

async function getWhatsappAbout(
  sock,
  targetJid
) {
  try {
    const result =
      await sock.fetchStatus(
        targetJid
      );

    return extractAboutText(
      result
    );

  } catch (err) {
    return '';
  }
}


// ====================================================================
// 👤 PROFILE OWNER
// ====================================================================

async function me(ctx) {
  // Hanya owner.
  if (
    !isOwner(
      ctx.msg
    )
  ) {
    return;
  }


  const ownerJid =
    jid(
      config.ownerNumber
    );


  const photoUrl =
    await getProfilePhotoUrl(
      ctx.sock,
      ownerJid
    );


  const whatsappAbout =
    await getWhatsappAbout(
      ctx.sock,
      ownerJid
    );


  const name =
    config.ownerMentionName ||
    'Fauzy';


  const phone =
    formatPhoneNumber(
      config.ownerNumber
    );


  const instagramLink =
    formatInstagramLink(
      config.ownerInstagram
    );


  const about =
    config.ownerAbout ||
    whatsappAbout ||
    '-';


  const caption =
`👤 *PROFILE ${name.toUpperCase()}*

*Nama:* ${name}
*Nomor WhatsApp:* ${phone}
*Instagram:* ${instagramLink}
*About:* ${about}

✨ Powered by ${config.botName}`;


  if (photoUrl) {
    return ctx.sock.sendMessage(
      ctx.from,
      {
        image: {
          url:
            photoUrl,
        },

        caption,
      },
      {
        quoted:
          ctx.msg,
      }
    );
  }


  return ctx.reply(
    caption
  );
}


// ====================================================================
// 📋 DAFTAR COMMAND
// ====================================================================

async function commandList(ctx) {
  const prefix =
    config.prefix || '.';


  const owner =
    isOwner(
      ctx.msg
    );


  // ==================================================================
  // 👤 COMMAND CUSTOMER
  // ==================================================================

  const customerCommands =
`✨ *DAFTAR COMMAND BOT* ✨

*MENU UMUM*
• ${prefix}menu — tampilkan menu utama
• ${prefix}help — alias menu
• ${prefix}command — tampilkan daftar command
• ${prefix}commands — alias command
• ${prefix}ping — cek status dan respon bot

*PEMBAYARAN*
• ${prefix}payment — tampilkan metode pembayaran
• ${prefix}bayar — alias payment

*BMKG*
• ${prefix}gempa — informasi gempa terbaru
• ${prefix}cuaca — prakiraan cuaca lokasi default
• ${prefix}cuaca : Tamansari — cari cuaca berdasarkan desa/kelurahan
• ${prefix}cuaca : 35.07.06.2012 — cari berdasarkan kode ADM4 BMKG`;


  // ==================================================================
  // 👑 COMMAND OWNER
  // ==================================================================

  const ownerCommands =
`

👑 *COMMAND OWNER*

*AI CUSTOMER SERVICE*
• ${prefix}aion — aktifkan balasan otomatis AI
• ${prefix}aioff — nonaktifkan balasan otomatis AI
• ${prefix}aistatus — cek status AI customer service

Harga dan paket akun premium dibaca dari:
*src/data/pricelist.txt*

*AI MANUAL*
• ${prefix}balas <teks> — buat balasan WhatsApp
• ${prefix}maaf <masalah> — buat pesan permintaan maaf
• ${prefix}romantis <tema> — buat pesan romantis

Contoh:
• ${prefix}balas customer menanyakan kapan pesanan tersedia
• ${prefix}maaf saya terlambat membalas pesan
• ${prefix}romantis pasangan sedang lelah bekerja

Command AI manual tetap dapat digunakan meskipun ${prefix}aioff.

*PROFILE*
• ${prefix}me — tampilkan profil owner

*GOOGLE IMAGE*
• ${prefix}googleimage : semeru — cari dan kirim gambar

*NO CALL*
• ${prefix}nocall on — aktifkan penolakan panggilan otomatis
• ${prefix}nocall off — nonaktifkan penolakan panggilan otomatis
• ${prefix}nocall — cek status No Call

*CUSTOM TEXT*
• ${prefix}addtext kata kunci : isi teks — tambah custom text
• ${prefix}deltext kata kunci — hapus custom text

*FITUR GRUP*
• ${prefix}grup on — aktifkan fitur bot di grup ini
• ${prefix}grup off — nonaktifkan fitur bot di grup ini
• ${prefix}grup status — cek status fitur grup
• ${prefix}group — alias grup

*AUDIT LOG*
• ${prefix}setlog on — aktifkan audit log
• ${prefix}setlog off — nonaktifkan audit log

*PENYIMPANAN*
• ${prefix}reset stats — cek penggunaan penyimpanan
• ${prefix}reset logs confirm — hapus audit log
• ${prefix}reset uploads confirm — hapus file upload
• ${prefix}reset deliveries confirm — hapus file delivery`;


  // ==================================================================
  // 📝 CATATAN
  // ==================================================================

  const customerNote =
`

*Catatan:*
• Untuk informasi akun premium, harga, ketersediaan, dan pemesanan, silakan hubungi admin.
• Harga resmi mengikuti daftar harga yang dikelola admin.`;


  const ownerNote =
`

*Catatan Owner:*
• Command owner hanya dapat digunakan oleh owner.
• AI customer service otomatis hanya aktif setelah ${prefix}aion.
• ${prefix}aioff tidak mematikan ${prefix}balas, ${prefix}maaf, dan ${prefix}romantis.
• Fitur grup hanya aktif setelah ${prefix}grup on pada grup tersebut.
• Saat fitur grup nonaktif, bot tidak merespons command lain di grup.
• Custom text hanya dapat digunakan oleh owner.
• ${prefix}googleimage hanya dapat digunakan oleh owner.
• Perubahan harga cukup dilakukan pada *src/data/pricelist.txt*.`;


  return ctx.reply(
    customerCommands +
    (
      owner
        ? ownerCommands +
          ownerNote
        : customerNote
    )
  );
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = {
  me,
  commandList,
};