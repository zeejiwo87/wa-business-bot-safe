const config = require('../config');
const { isOwner, jid } = require('../utils/format');

function formatPhoneNumber(number) {
  const clean = String(number || '').replace(/\D/g, '');

  if (!clean) return '-';

  if (clean.startsWith('62')) {
    return `+${clean}`;
  }

  if (clean.startsWith('0')) {
    return `+62${clean.slice(1)}`;
  }

  return clean;
}

function formatInstagram(username) {
  const value = String(username || '').trim();

  if (!value) return '-';

  const clean = value
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/$/, '')
    .trim();

  if (!clean) return '-';

  return `@${clean}`;
}

async function getProfilePhotoUrl(sock, targetJid) {
  try {
    return await sock.profilePictureUrl(targetJid, 'image');
  } catch (err) {
    return null;
  }
}

async function getWhatsappAbout(sock, targetJid) {
  try {
    const result = await sock.fetchStatus(targetJid);

    if (Array.isArray(result)) {
      return result[0]?.status || '';
    }

    return result?.status || '';
  } catch (err) {
    return '';
  }
}

async function me(ctx) {
  // Selain owner: bot diam
  if (!isOwner(ctx.msg)) return;

  const ownerJid = jid(config.ownerNumber);
  const photoUrl = await getProfilePhotoUrl(ctx.sock, ownerJid);
  const whatsappAbout = await getWhatsappAbout(ctx.sock, ownerJid);

  const name = config.ownerMentionName || 'Fauzy';
  const phone = formatPhoneNumber(config.ownerNumber);
  const instagram = formatInstagram(config.ownerInstagram);
  const about = whatsappAbout || config.ownerAbout || '-';

  const caption = `👤 *PROFILE ${name.toUpperCase()}*

*Nama:* ${name}
*Nomor WhatsApp:* ${phone}
*Instagram:* ${instagram}
*About:* ${about}

✨ Powered by ${config.botName}`;

  if (photoUrl) {
    return ctx.sock.sendMessage(
      ctx.from,
      {
        image: { url: photoUrl },
        caption,
      },
      { quoted: ctx.msg }
    );
  }

  return ctx.reply(caption);
}

async function commandList(ctx) {
  const owner = isOwner(ctx.msg);

  const customerCommands = `✨ *DAFTAR COMMAND BOT* ✨

*MENU UMUM*
• ${config.prefix}menu — tampilkan menu utama
• ${config.prefix}help — tampilkan menu utama
• ${config.prefix}command — tampilkan semua command

*MENU CUSTOMER*
• ${config.prefix}catalog — daftar aplikasi premium
• ${config.prefix}katalog — alias catalog
• ${config.prefix}premium — alias catalog
• ${config.prefix}catalog canva — detail produk
• ${config.prefix}jasa — daftar layanan asistensi tugas
• ${config.prefix}tugas — alias jasa
• ${config.prefix}joki — alias jasa
• ${config.prefix}jasa makalah — detail layanan
• ${config.prefix}payment — metode pembayaran
• ${config.prefix}bayar — alias payment
• ${config.prefix}order premium | CANVA | 1 Tahun Member + Designer | email kamu
• ${config.prefix}order jasa | Makalah | detail tugas + deadline
• ${config.prefix}status ORD-xxxx — cek status order
• ${config.prefix}cancel ORD-xxxx — batalkan order`;

  const ownerCommands = `

*MENU OWNER / ADMIN*
• ${config.prefix}me — tampilkan profil owner
• ${config.prefix}admin orders — lihat semua order
• ${config.prefix}admin order ORD-xxxx — lihat detail order
• ${config.prefix}admin status ORD-xxxx proses/selesai/batal/revisi
• ${config.prefix}admin note ORD-xxxx catatan
• ${config.prefix}admin stats — statistik order
• ${config.prefix}setlog on — aktifkan audit log
• ${config.prefix}setlog off — matikan audit log

*MENU CUSTOM TEXT*
• ${config.prefix}addtext love you : isi teks panjang — tambah custom text
• ${config.prefix}deltext love you — hapus custom text

*MENU EDIT HARGA*
• ${config.prefix}edit harga canva — edit harga produk
• ${config.prefix}edit harga netflix — edit harga produk lain
• ${config.prefix}edit harga jasa makalah — edit harga jasa

*MENU GRUP*
• ${config.prefix}grup on — aktifkan fitur otomatis di grup ini
• ${config.prefix}grup off — matikan fitur otomatis di grup ini
• ${config.prefix}grup status — cek status fitur grup

*MENU PENYIMPANAN*
• ${config.prefix}reset stats — cek penyimpanan bot
• ${config.prefix}reset logs confirm — hapus audit log
• ${config.prefix}reset uploads confirm — hapus file upload
• ${config.prefix}reset deliveries confirm — hapus file delivery
• ${config.prefix}reset orders confirm — hapus semua order
• ${config.prefix}reset all confirm — reset data bot`;

  const note = `

Catatan:
• Command owner/admin hanya bisa digunakan oleh owner.
• Fitur grup hanya aktif kalau sudah dinyalakan dengan ${config.prefix}grup on.
• Custom text hanya bisa dipanggil oleh owner.`;

  return ctx.reply(customerCommands + (owner ? ownerCommands : '') + note);
}

module.exports = {
  me,
  commandList,
};