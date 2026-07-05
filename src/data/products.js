module.exports = [
  {
    key: 'camscanner',
    name: 'CAMSCANNER PREMIUM',
    category: 'Produktivitas',
    variants: [
      { name: '1 Tahun Sharing', price: 13000 }
    ],
    notes: ['Akun dari seller', 'Garansi 6 bulan']
  },
  {
    key: 'canva',
    name: 'CANVA PREMIUM',
    category: 'Desain',
    variants: [
      { name: '1 Bulan Member + Designer', price: 1000 },
      { name: '3 Bulan Member + Designer', price: 3000 },
      { name: '1 Tahun Member + Designer', price: 5000 },
      { name: 'Lifetime EDU', price: 6000 },
      { name: '1 Bulan Head', price: 8000 }
    ],
    notes: ['Bisa invite 100 member', 'Akun dari seller', 'Full garansi', 'EDU lifetime garansi 1 tahun', 'Via invite email']
  },
  {
    key: 'capcut',
    name: 'CAPCUT PREMIUM',
    category: 'Editing',
    variants: [
      { name: 'Private 7 Hari', price: 25000 },
      { name: 'Private 1 Bulan', price: 42000 },
      { name: 'Private 2 Bulan', price: 73000 },
      { name: 'Private 6 Bulan garansi 1 bulan', price: 105000 }
    ],
    notes: ['Diproses sesuai antrian', 'Full garansi', 'All transaction no refund']
  },
  {
    key: 'chatgpt',
    name: 'CHATGPT PREMIUM',
    category: 'AI Tools',
    variants: [
      { name: 'ChatGPT Plus 1 Bulan No Garansi', price: 38000 },
      { name: 'ChatGPT Plus 1 Bulan 5 pcs', price: 165000 },
      { name: 'ChatGPT Go 3 Bulan No Garansi', price: 33000 },
      { name: 'ChatGPT Go 3 Bulan 5 pcs', price: 150000 },
      { name: 'ChatGPT Go 3 Bulan Garansi 25 Hari', price: 45000 }
    ],
    notes: ['Account seller only']
  },
  {
    key: 'disney',
    name: 'DISNEY+ PREMIUM',
    category: 'Streaming',
    variants: [
      { name: '1 Bulan Sharing 6 User', price: 25000 }
    ],
    notes: ['Region Indonesia', 'Bisa langsung OTP', 'Sharing 1x OTP kecuali logout']
  },
  {
    key: 'disney harian',
    name: 'DISNEY+ HARIAN',
    category: 'Streaming',
    variants: [
      { name: '1 Hari Sharing 6 User', price: 8000 },
      { name: '3 Hari Sharing 6 User', price: 10000 },
      { name: '5 Hari Sharing 6 User', price: 14000 },
      { name: '7 Hari Sharing 6 User', price: 23000 }
    ],
    notes: ['Region Indonesia', 'Bisa langsung OTP', 'Sharing 1x OTP kecuali logout']
  },
  {
    key: 'getcontact',
    name: 'GETCONTACT PREMIUM',
    category: 'Utility',
    variants: [
      { name: '1 Bulan', price: 14000 }
    ],
    notes: ['Verifikasi menggunakan OTP WhatsApp', 'Nomor harus aktif dan terhubung WA', 'Proses 1–15 menit']
  },
  {
    key: 'lightroom',
    name: 'LIGHTROOM PREMIUM',
    category: 'Editing',
    variants: [
      { name: '1 Bulan Sharing', price: 9000 },
      { name: '1 Tahun Sharing', price: 22000 }
    ],
    notes: ['Support iOS & Android', 'Akun dari seller']
  },
  {
    key: 'netflix',
    name: 'NETFLIX PREMIUM',
    category: 'Streaming',
    variants: [
      { name: '1 Bulan Sharing 1P1U', price: 38000 },
      { name: '1 Bulan Sharing 1P2U', price: 28000 },
      { name: '1 Bulan Semi Private', price: 45000 },
      { name: '1 Bulan Private', price: 175000 }
    ],
    notes: ['Full garansi sesuai durasi', 'Fix error 3×24 jam', 'Support semua device', 'Akun dari seller']
  },
  ...[
    'CATCHPLAY+', 'DUOLINGO', 'HBO MAX', 'IBIS PAINT', 'IQIYI', 'LOKLOK',
    'NETFLIX HARIAN', 'PICSART', 'PRIME', 'SCRIBD', 'SPOTIFY', 'TELEPREM',
    'TURNITIN', 'VIDIO', 'VIU', 'VSCO', 'WATTPAD', 'WETV', 'WINK', 'YOUTUBE', 'ZOOM'
  ].map((name) => ({
    key: name.toLowerCase(),
    name,
    category: 'Lainnya',
    variants: [{ name: 'Hubungi admin untuk harga terbaru', price: null }],
    notes: ['Stok dan harga dapat berubah', 'Chat admin untuk detail']
  }))
];
