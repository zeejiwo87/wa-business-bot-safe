# WA Business Bot Safe

Fitur:
- Katalog aplikasi premium
- Katalog asistensi tugas berbasis layanan/pendampingan
- Payment method: GoPay + QRIS manual
- Order tracking dengan SQLite
- Admin panel via WhatsApp command
- Arsip order berbasis consent untuk pesan yang dikirim ke bot

> Catatan etika dan keamanan:
> Project ini tidak menyertakan fitur bypass View Once atau replay pesan yang dihapus dari chat pribadi. Gunakan bot hanya untuk pelanggan yang menghubungi bisnis kamu dan sudah setuju menerima balasan.

## Install di VPS Ubuntu

```bash
sudo apt update
sudo apt install -y nodejs npm build-essential python3 make g++
node -v
npm -v
```

Disarankan Node.js 20+. Kalau versi Node bawaan Ubuntu lama, install via NodeSource.

## Setup

```bash
cp .env.example .env
npm install
npm start
```

Login WhatsApp:
- Scan QR dari terminal.
- Pakai nomor khusus bisnis, jangan nomor pribadi utama.

## Command User

```text
.menu
.catalog
.catalog canva
.catalog netflix
.jasa
.jasa makalah
.order premium | CANVA | 1 Tahun Member + Designer | email: nama@email.com
.order jasa | Makalah | detail tugas dan deadline
.payment
.status ORD-xxxx
.cancel ORD-xxxx
```

## Command Admin

```text
.admin orders
.admin order ORD-xxxx
.admin status ORD-xxxx proses
.admin status ORD-xxxx selesai
.admin status ORD-xxxx batal
.admin note ORD-xxxx catatan untuk user
.admin stats
.setlog on
.setlog off
```

## QRIS

Taruh gambar QRIS di:

```text
storage/qris/qris.png
```

Lalu command `.payment` akan mengirim teks payment. Kalau ingin auto kirim QRIS, aktifkan/ubah fungsi di `src/commands/payment.js`.

## Struktur

```text
src/index.js                 core koneksi WA
src/db.js                    SQLite schema + seed
src/router.js                command router
src/commands/                command user dan admin
src/modules/orderService.js  logic order
src/data/products.js         data katalog premium
src/data/services.js         data jasa asistensi
```
