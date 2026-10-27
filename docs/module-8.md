# Modul 8 — Tiket Digital & Verifikasi Kode Kasir

Pembeli menunjukkan tiket berisi QR dan kode 5 karakter. Kasir mitra mencocokkan kode
itu di halaman **Verifikasi kode**, menyerahkan pesanan, lalu menandainya sudah diambil.

Jalankan `python manage.py migrate` dari `backend/` untuk membuat tabel
`VerificationLog` (migrasi `0013_verification_log`).

## Alur penggunaan

1. **Pembeli** membayar pesanan (Modul 7). Di **Pesanan saya**, kartu pesanan aktif
   menampilkan kode `H7K · 49` dan tombol **Lihat tiket**.
2. **Tiket** (`/pesanan/{id}/tiket`) berisi struk ambil: nama dan alamat toko, QR 144 px
   dengan latar putih (tetap terbaca di tema gelap), kode, jam ambil, porsi, harga,
   penghematan, dan nomor pesanan. Di sebelahnya ada status, hitung mundur dengan sumbu
   3 px (penuh = 4 jam), linimasa (dibayar → toko buka → batas batal → batas ambil),
   **Buka rute** (Google Maps di tab baru), dan **Batalkan pesanan** dengan konfirmasi
   inline sampai 30 menit sebelum batas ambil.
3. **Mitra** membuka **Dasbor → Verifikasi kode** (`/api/partner/kasir`). Kasir
   mengetik kode di 5 kotak (huruf otomatis kapital, hanya alfabet kode, dicek begitu
   karakter ke-5 terisi) atau memakai **Pindai QR**.
4. Jika **kode cocok**, panel menampilkan menu × porsi, pembeli (`Rani A.`), jendela
   ambil, pembayaran simulasi, dan nomor pesanan. **Tandai sudah diambil** (atau Enter)
   mengubah status menjadi `picked_up`. Kotak langsung kosong untuk kode berikutnya, dan
   **Urungkan** tersedia selama 60 detik.
5. Tiket pembeli yang masih terbuka ikut berubah menjadi **Sudah dipakai** (QR diganti,
   kode dicoret). Tiket menyegarkan data setiap 15 detik dan saat tab kembali difokuskan.

Pintasan keyboard di halaman kasir: **F2** fokus ke kotak kode, **Enter** tandai sudah
diambil (kecuali fokus sedang berada di tombol lain), **Esc** kode lain.

## Hasil verifikasi

| Hasil | Kondisi | Warna | Dicatat di Verifikasi terakhir |
| --- | --- | --- | --- |
| Kode cocok | Pesanan lunas milik toko ini | Hijau | Saat ditandai diambil (`Diambil`) |
| Tidak ditemukan | Kode tidak ada | Merah | `Ditolak` |
| Milik toko lain | Kode ada, tetapi milik mitra lain; detail pesanan tidak ditampilkan | Merah | `Ditolak` |
| Sudah dipakai | Sudah diambil, ditampilkan jamnya | Cokelat | `Ditolak` |
| Pesanan sudah dibatalkan | Dibatalkan pembeli atau mitra, ditampilkan jamnya | Cokelat | `Ditolak` |
| Kode kedaluwarsa | Batas ambil lewat | Cokelat | `Ditolak` |
| Belum dibayar | Pesanan masih `pending` | Cokelat | `Ditolak` |

Kotak kode tetap berisi kode yang ditolak, dengan garis sesuai warna hasil. Mengetik
karakter baru mengosongkan hasil. **Verifikasi terakhir** menampilkan 5 catatan terbaru
milik mitra itu.

## Pindai QR

QR di tiket berisi kode itu sendiri. **Pindai QR** membuka kamera dalam dialog:

- Memakai `BarcodeDetector` bawaan browser bila tersedia (Android, macOS).
- Di browser tanpa `BarcodeDetector` (Chrome untuk Windows), memakai jsQR 1.4.0 yang
  dimuat dari `/vendor/jsQR.js` saat tombol pertama kali dipakai.
- Hanya teks berupa kode HABISIN yang diterima; hasilnya dicek seperti kode yang diketik.
- Jika kamera ditolak atau tidak ada, dialog menjelaskannya dan kasir mengetik kode.
- Menutup dialog selalu mematikan kamera, termasuk kamera yang baru menyala setelah
  dialog ditutup atau dibuka ulang.

Kamera butuh HTTPS di produksi (PWS dan Vercel sudah HTTPS) dan izin dari browser.

## Endpoint

Semua endpoint dirender Django sebagai HTML untuk HTMX dan diakses lewat proxy `/api`
milik Next.js, sehingga cookie sesi dan token CSRF sama dengan halaman lain.

| Method | Path | Isi |
| --- | --- | --- |
| GET | `/api/partner/kasir` | Halaman kasir |
| POST | `/api/partner/kasir/check` | Cek kode (`code`), mengembalikan panel hasil |
| POST | `/api/partner/kasir/{id}/pickup` | Tandai sudah diambil |
| POST | `/api/partner/kasir/{id}/undo` | Urungkan dalam 60 detik |
| GET | `/api/partner/kasir/recent` | Daftar Verifikasi terakhir |

Setiap jawaban cek, serah, dan urungkan mengirim header `HX-Trigger: verified`, sehingga
daftar Verifikasi terakhir dimuat ulang tanpa reload halaman.

## Keamanan

- `@partner_only`: hanya akun mitra yang masuk; selain itu halaman 403 berbentuk HTML.
- `@partner_owns_reservation`: serah dan urungkan hanya untuk pesanan dari listing milik
  mitra itu; pesanan toko lain dijawab 404, dan barisnya dikunci selama transaksi.
- Rate limit: 30 cek kode per menit per akun mitra, lalu 429 dengan pesan
  "Terlalu banyak percobaan…".
- Kode milik toko lain hanya dijawab "Milik toko lain", tanpa nama menu, pembeli, atau toko.
- Nama pembeli disingkat (`Rani A.`).
- htmx dan jsQR disajikan dari aplikasi sendiri (`frontend/public/vendor`) dan dikunci
  dengan hash SRI. `.gitattributes` menjaga isi file itu tetap sama byte demi byte.

## Pengujian

- Backend: `python manage.py test main.test_verification` (semua hasil verifikasi,
  peran, kepemilikan, rate limit, serah, urungkan, dan daftar terakhir).
- Playwright (kedua server dan `seed_demo` berjalan):
  `npx playwright test tests/kasir.spec.ts tests/pickup-ticket.spec.ts tests/responsive.spec.ts`
  mencakup alur kasir, Pindai QR dengan kamera tiruan, varian tiket, dan tata letak di
  390, 760, dan 1440 px.
