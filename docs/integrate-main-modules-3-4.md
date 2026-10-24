# Integrasi main dengan Modul 3–4

## Keputusan yang disetujui

- Kontrak transaksi mengikuti Modul 7: pending → paid → picked_up, cancelled/expired.
- Maksimal 4 porsi/pesanan, catatan pembeli 140 karakter. `note` pesanan terpisah dari `buyer_notes` listing.
- Kuota donasi 2 porsi/pembeli/hari WIB lintas toko, dihitung memakai total transaksi nol. Cancelled/expired tidak dihitung; tidak membatasi satu tiket gratis aktif.
- Pending kedaluwarsa setelah 5 menit atau deadline ambil, mana lebih dahulu. Paid kedaluwarsa pada deadline. Stok dikembalikan satu kali. Expiry dievaluasi saat API diakses; belum ada scheduler.
- Pending dapat dibatalkan selama aktif. Paid ditolak pada sisa waktu ≤30 menit. Verifikasi kasir/QR belum diimplementasikan.
- Deadline pesanan merupakan snapshot agar perubahan listing tidak menghidupkan pesanan lama. Listing punya pesanan pending/paid mengunci harga/lokasi/waktu; stok dan nama masih dapat diperbarui sesuai fitur existing.
- Store tertutup, listing nonaktif/habis/berakhir tidak dapat dipesan. Harga dan stok diverifikasi kembali oleh server. Undo stok lama invalid setelah create/edit quantity/cancel/expiry/manual stock.
- SiteHeader menjadi fondasi seluruh header atas; logo PNG terbaru + habisin. tetap dipakai. Sidebar mitra dipertahankan. Palet memakai token main: brand #1F4D33, cream #F6F8F3, dark #14301F, serta token semantik urgency/error/focus.
- Layout dan fungsi listing/media/crop 4:3/multitoko/draft/discovery dipertahankan. Pembeli masuk ke Peta. OrderSummary dan OrderList main menggantikan tiket/daftar custom pada alur aktif.
- Keranjang batch dan pembatalan penjual ditunda: tombol dihilangkan, route dinonaktifkan, data historis tidak dihapus. Kode komponen lama yang tidak diimpor bukan fitur aktif.

## Migrasi dan data

`0012_merge_modules_3_4_and_orders` bergantung pada `0011_reservation_lifecycle` (branch modul) dan `0006_reservation_expired_status` (main). Migrasi terapan tidak ditulis ulang. Migrasi main mengubah reserved menjadi paid dan mengisi paid_at; migrasi modul menjaga relasi toko, media, metadata dan deadline. Kolom/tabel checkout dan alasan pembatalan lama tetap ada.

Sebelum migrasi operasional: cadangkan SQLite/database deployment dan MEDIA_ROOT sebagai pasangan; hentikan penulisan selama backup/migrasi. Jalankan `python manage.py showmigrations`, `python manage.py migrate --plan`, lalu `python manage.py migrate` **hanya setelah persetujuan pemilik data**. Tidak perlu seed. Jangan rollback dengan menghapus kolom, tabel atau file upload yang masih dipakai; pulihkan backup dan source yang cocok bila perlu. Migrasi main membatasi note 140 karakter: audit panjang note lama sebelum deployment PostgreSQL.

Pengujian upgrade memakai database sementara dari kedua schema asal, menjaga akun/password, listing, stok, foto dan riwayat. SQLite tidak membuktikan row locking/concurrency PostgreSQL produksi.

## Verifikasi terisolasi

Backend: `.venv/bin/python` menjalankan Django tests dengan DATABASES dan MEDIA_ROOT diarahkan ke direktori sementara sebelum django.setup. Jangan menjalankan suite browser pada backend database kerja.

Untuk browser, dari backend:

```sh
HABISIN_TEST_PORT=8001 HABISIN_TEST_ORIGIN=http://127.0.0.1:3002 .venv/bin/python ../frontend/tests/serve-backend.py
```

Build/jalankan frontend salinan sementara dengan `BACKEND_URL=http://127.0.0.1:8001`, port 3002. Dari frontend gunakan `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3002 npm run test:e2e`. Frontend3000/backend8000 tidak dimatikan untuk pengujian ini. Server uji memakai cache geocoding fixture; ini bukan verifikasi provider geocoding atau cloud storage nyata.

Pemeriksaan akhir meliputi Django check/drift/tests/dua jalur migrasi, lint/TypeScript/build Webpack, Playwright alur utama desktop/mobile, console/network dan diff Git. Hasil aktual dicatat setelah pengujian akhir; keberhasilan lama tidak dianggap hasil pengujian integrasi saat ini.

## Kepemilikan dan batas kerja

Modul 3–4 mempertahankan implementasi branch pengembang; transaksi dan komponen Modul 7 berasal dari main. Atribusi kedua kontributor/alat AI tetap ada di README dan dokumen Modul 7. Tidak menambah dependency atau mengubah lockfile. Branch tetap feat/modul-3-4-listing-food-map-explorer. Penyelesaian ini tidak membuat merge commit/push atau memigrasikan data kerja.

## Hasil verifikasi integrasi

- Django: 110 tes lulus (23,4 detik), termasuk upgrade schema dari kedua branch. Check dan migration drift bersih.
- Frontend: TypeScript dan lint tanpa error; build produksi Webpack lulus pada salinan sementara. Build default Turbopack tidak diklaim teruji.
- Browser: 65/69 skenario lulus pada rangkaian penuh awal. Empat kegagalan disebabkan asumsi tes lama (tombol pembatalan disembunyikan, identitas marker, navigasi detail, label login ganda) dan pembacaan stok sebelum respons optimistic selesai. Keempatnya lulus setelah koreksi melalui pengulangan terarah; skenario copy lintas akun juga diulang pada origin uji.
- Playwright CLI: screenshot 1440×1000 dan 390×844, satu header, tidak ada overflow dokumen; token brand #1F4D33. Tidak ada error JavaScript; respons 403 auth/me untuk tamu memang diharapkan. Layanan tile/geocoding eksternal bukan quality gate integrasi.
- Ditemukan context test lintas akun yang memakai origin development hardcoded. Alamat itu diganti memakai fixture baseURL dan helper mutasi memeriksa origin sebelum menulis. Sebelum diperbaiki, satu fixture sempat dibuat di database development; fixture itu sudah dihapus setelah persetujuan pemilik database. Saat pembersihan, seluruh baris tabel lain diverifikasi tidak berubah. Detail identitas fixture hanya ada dalam catatan lokal, bukan Git. Karena itu tidak diklaim bahwa hash database kerja sama dengan awal.
- Tidak menerapkan migrasi/seed pada database kerja. File media kerja tetap sesuai hash awal. Data development dan artefak browser/AI/OpenSpec tidak dimasukkan ke staging.
