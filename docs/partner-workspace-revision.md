# Ruang kerja mitra dan moderasi

## Cakupan dan rujukan desain

Dashboard `/partner` dan Pesanan `/partner/orders` memakai pola Baris 13: waktu ambil WIB, pembeli, makanan, catatan, filter tanggal/status/cabang, pagination, serta pembatalan. Tombol Verifikasi belum aktif. Kode pengambilan hanya diterima pembeli; serializer pesanan mitra tidak mengandung `code`, termasuk dashboard lama.

Kelola listing `/partner/listings` mengikuti Baris 17: tabel inventaris, stok tersisa yang disimpan melalui AJAX, konfirmasi nonaktif/hapus, drawer Ubah 480 px (lebar layar pada mobile), serta status Tayang/Draf/Nonaktif/Diturunkan/Semua. Draf tetap lokal di IndexedDB browser, bukan listing publik. Seluruh kategori berupa pill horizontal yang dapat digulir dan diakses dengan keyboard. Detail toko dan informasi makanan selalu terlihat pada tambah maupun ubah. Crop 4:3, URL alternatif, upload, dan validasi sebelumnya dipertahankan.

Harga, toko, lokasi, dan waktu pengambilan tetap dikunci backend ketika ada pesanan pending/paid. Stok merupakan porsi tersisa, bukan total termasuk yang sudah dipesan. Penghapusan ditolak bila masih ada pesanan aktif. Listing dengan riwayat selesai diarsipkan agar hilang dari inventaris/katalog tanpa menghapus transaksi atau foto yang masih dirujuk. Listing tanpa riwayat dihapus beserta foto yang sudah tidak dipakai.

Profil toko `/partner/store` mengikuti Baris 14: pilihan cabang eksplisit saat ada beberapa toko, identitas/alamat/jadwal, pin dan preview, bilah simpan hanya ketika berubah, reset, serta dialog sebelum membuang perubahan saat pindah cabang/halaman. Peringatan browser berlaku ketika meninggalkan tab. Konfirmasi lokasi adalah konfirmasi mitra, bukan persetujuan admin.

Akun `/partner/account` dan `/admin/account` menyediakan data login, password ulang + indikator kekuatan, informasi sesi yang benar-benar diketahui, dan hapus akun dengan password + checkbox. Mitra tidak dapat menghapus akun selama ada pending/paid. Tidak ada penjadwal penghapusan. Mengganti password mempertahankan sesi ini dan membatalkan sesi lama lain sesuai mekanisme Django.

Admin `/admin` mengikuti struktur Baris 19 dengan jumlah nyata: listing tersedia, pesanan dibuat hari ini WIB, akun mitra aktif, toko aktif, dan aktivitas moderasi. `/admin/listings` dan `/admin/log` menurunkan/memulihkan serta menampilkan log. Komplain, persetujuan mitra/lokasi, QR dan verifikasi kode belum tersedia. Log pada revisi ini bersifat catatan tindakan yang dibaca/filter; bukan implementasi penuh CRUD Modul 6.

## API tambahan

Semua mutation membutuhkan sesi dan CSRF. Role/ownership diperiksa server.

| Endpoint | Kontrak |
| --- | --- |
| `GET /api/partner/orders` | `status=active/all/history/pending/paid/picked_up/cancelled/expired`, `from/to` tanggal ambil WIB inklusif (maksimal rentang 366 hari), `store_id` milik sendiri, `q`, `page`, `page_size` 1–100. Respons `results/count/page/page_size/counts`. Tidak memuat kode. |
| `POST /api/partner/reservations/:id/cancel` | `reason` wajib teks 1–500 karakter setelah trim. Pending/paid yang belum kedaluwarsa boleh dibatalkan, termasuk ≤30 menit. Retry mengembalikan hasil pertama; stok sekali. Pesanan orang lain 404, role lain 403, selesai/expired 409. |
| `POST /api/partner/stores/:id/close` | `confirmation_name` persis. Tutup permanen ditolak saat ada pesanan aktif (409); semua penawaran cabang dinonaktifkan. Cabang lain tidak berubah. Tidak bisa dibuka kembali. |
| `GET /api/admin/summary` | Angka data aplikasi aktual, lima aktivitas terbaru, flag fitur belum tersedia. |
| `GET /api/admin/listings` | `status=all/live/removed`, `q`, pagination. |
| `POST /api/admin/listings/:id/moderate` | `action=take_down/restore`, `reason` wajib 1–500. Admin saja. Idempoten terhadap status saat ini, tidak menggandakan log. |
| `GET /api/admin/moderation-logs` | `action=take_down/restore`, `q`, pagination; waktu, admin, target, tindakan, alasan. |

Serializer pembeli menambah `cancellation_note/cancelled_by/cancelled_at`. Alasan tampil pada riwayat, ringkasan, dan pembayaran. Daftar pembeli menyegarkan saat fokus dan berkala; bukan push notification/email.

## Moderasi dan migrasi

Migrasi additive `0013_partner_workspace_moderation` menambah metadata moderasi/arsip listing, `ModerationLog`, kategori/alamat tambahan/jadwal/penutupan toko. Data sebelumnya tetap valid: jadwal `[]` menggunakan jam harian lama, dan field tambahan boleh kosong. Nama/deskripsi baru maksimal 60/280; teks lama yang lebih panjang dapat dipertahankan tanpa diubah.

Jadwal berisi tujuh hari `day:0..6` (Senin–Minggu), `enabled:boolean`, serta hingga tiga `{start:"HH:MM",end:"HH:MM"}`. Hari buka minimal satu sesi. Waktu sama dan sesi tumpang tindih (termasuk lintas malam/Minggu–Senin) ditolak. Jadwal tidak otomatis membuka/menutup status toko; `is_open` tetap kendali mitra. Default batas ambil listing baru mengikuti sesi terakhir hari itu; mitra masih menentukan waktu listing. Alamat/pin menggunakan geocoding dan konfirmasi yang sudah ada; perubahan lokasi ditolak selama ada pesanan aktif.

Take-down menyembunyikan listing dari katalog/peta/pemesanan baru dan mengunci ubah, stok, aktifkan, hapus, sold-out, dan undo milik mitra. Pesanan pending/paid dibatalkan dengan pelaku admin dan alasan; stok yang masih ditahan dikembalikan tepat sekali. Kedua jalur moderasi menggunakan kontrak yang sama. Pemulihan melepas kunci tetapi **tidak** otomatis menayangkan listing. Mitra harus memeriksa waktu/stok/toko dan mengaktifkannya sendiri. Admin/penutupan membatalkan token undo stok lama.

Sebelum menerapkan migrasi pada database kerja, cadangkan `backend/db.sqlite3` dan `backend/media`, lalu jalankan `DEBUG=True .venv/bin/python manage.py migrate --noinput` dari backend. Penerapan pada data kerja membutuhkan persetujuan tersendiri; tidak dilakukan oleh tes.

## Verifikasi

`backend/main/test_workspace_revision.py` memeriksa privacy/ownership, notes/cancel/retry/stok/expired, filter tanggal, moderasi dan bypass, arsip, jadwal, tutup toko, password dan perlindungan akun. Suite migrasi menguji upgrade kedua cabang lama hingga migrasi terbaru tanpa menghapus data.

`frontend/tests/workspace-revision.spec.ts` memakai backend Django nyata sementara: pembeli → catatan pesanan → mitra membatalkan → alasan diterima pembeli; stok/inventaris/panel; multi-cabang/dirty/simpan jadwal; moderasi admin/log/pemulihan; akses, loading/error/kosong, mobile/desktop, keyboard dan tema. Fixture admin opsional hanya dibuat oleh `serve-backend.py` di TemporaryDirectory, melalui `HABISIN_TEST_ADMIN_PASSWORD`. Jangan menyalakan fixture terhadap database kerja. Semua konteks request mengikuti `PLAYWRIGHT_BASE_URL` dan origin guard.

CSS memakai token light/dark yang sudah ada, fokus terlihat, kontrol utama minimal 44 px, dialog native dengan fokus kembali, tabel menjadi kartu pada mobile, kategori horizontal, sidebar mobile, serta header landing tanpa teks tombol bertumpuk vertikal. Pemeriksaan akhir mencakup lint, TypeScript, build, Django check/drift/tests, browser flows dan inspeksi Playwright CLI. Hasil eksekusi dilaporkan terpisah; dokumen ini tidak menyatakan tes telah lulus.

## Hasil verifikasi 26 Oktober 2026

- Seluruh 123 tes Django lulus pada database/media sementara, termasuk upgrade dua skema lama, sesi password, dan kontrak moderasi/pembatalan. `check` bersih dan `makemigrations --check --dry-run` melaporkan tidak ada perubahan model yang belum dimigrasikan.
- ESLint, TypeScript `--noEmit`, dan build produksi Next.js Webpack lulus. Build menggunakan API upstream uji `127.0.0.1:8001`; tidak dipasang ke deployment publik. Font Google yang sudah dipakai proyek memerlukan jaringan saat build.
- 56 tes Playwright pada sepuluh suite relevan lulus dalam pemeriksaan gabungan terakhir. Termasuk alur pembeli/mitra/admin nyata, upload/crop/draf, geocoding error/konfirmasi, multi-cabang, proteksi tiket, akun, moderasi, loading/error/empty/retry, dan kontras light/dark. Viewport 1440/390 serta landing 360 px tidak overflow pada skenario yang diuji.
- Inspeksi Playwright CLI mengambil screenshot desktop/mobile dan memeriksa console/network. API admin mengembalikan 200 dan tidak ada JavaScript error pada halaman admin yang diperiksa. Ada peringatan preload CSS/font Next.js; guest `403 auth/me` sesuai kontrak. URL foto `example.com` milik fixture tidak menyediakan aset nyata dan digantikan stub pada tes browser. Aset fixture tidak masuk data kerja.
- Seluruh tes menggunakan database/media sementara; dependency/lockfile tidak diubah. Setelah tes selesai dan pengguna menyetujui backup + migrasi, migrasi 0013 diterapkan pada database kerja. Seluruh baris/kolom lama tetap dipertahankan, file media tidak berubah, dan integrity check SQLite lulus. Verifikasi kode, QR, komplain, dan approval mitra/lokasi tetap belum tersedia sesuai cakupan yang disetujui.

Halaman Pesanan/Dasbor mitra membuka Pesanan masuk (`active`: pending + paid) dari semua tanggal ambil secara default. Filter tanggal tetap tersedia secara eksplisit; pesanan untuk besok/lusa tidak tersembunyi oleh filter hari ini. Daftar menyegarkan saat fokus, tiap 10 detik, serta saat batas waktu pesanan lewat.

Audit responsif lanjutan dan hasil perbandingan header/navigasi: [responsive-ui-audit.md](responsive-ui-audit.md).
