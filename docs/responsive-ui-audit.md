# Audit dan perbaikan responsif

Audit 26 Oktober 2026 menggunakan skill playwright-cli serta Playwright Test pada Chromium. Perubahan merupakan koreksi UI responsif dari workspace yang sudah ada; kontrak API, stok, pembayaran, moderasi dan data kerja dipertahankan.

## Temuan awal

| Area | Sebelum | Sesudah |
| --- | --- | --- |
| Header guest pada 390 px | 221 px, empat baris dengan posisi aksi tidak konsisten | 161 px, grid logo/aksi, pencarian/lokasi, navigasi |
| Header pesanan pembeli pada 390 px | 215 px, tidak ada aksi keluar | 161 px, keluar tersedia di header |
| Header halaman mitra pada 390 px | 109 px, selain bar navigasi 64 px | 69 px, selain bar navigasi 64 px |
| Inventaris mobile | Enam sel menjadi enam blok vertikal | Produk + dua kolom metadata + satu baris aksi |
| Filter pesanan mobile | Tujuh pill membungkus beberapa baris, tanggal/cabang selalu memenuhi halaman | Status satu baris yang dapat digulir; filter cabang/tanggal dibuka sesuai kebutuhan |
| Navigasi mitra mobile | Menu memperpanjang halaman; keluar tersembunyi saat menu tertutup | Dialog overlay dengan fokus/Escape; keluar tersedia di header dan menu |
| Sidebar desktop | Tombol keluar mengikuti bagian paling bawah konten panjang | Sidebar sticky setinggi viewport, tombol keluar tetap terjangkau |
| Profil toko | Fieldset melebar melebihi viewport dan input waktu bertumpuk | Fieldset boleh menyusut; jam buka/tutup berdampingan; tautan Identitas/Lokasi/Jam buka membantu navigasi form |

Pada 1024 px header guest/pembeli menggunakan dua baris terencana (113 px). Workspace memakai navigasi overlay sampai 1024 px untuk memberi ruang pada isi. Logo asli, pencarian, GPS, autentikasi, tema, filter serta semua field form tetap tersedia. Nama lokasi terpotong secara visual bila panjang; label aksesibelnya lengkap.

## Perubahan kode

- `site-header.module.css`, `landing-page.tsx`, `buyer-header.tsx`: susunan header responsif dan kontrol utama 44 px. Nama kelas tombol login khusus menghindari aturan display komponen menimpa visibilitas mobile.
- `logout-button.tsx`, `order-shell.tsx`, `store-profile.tsx`, `store-ui.tsx`: aksi logout reusable, pending/anti-klik-ganda, pesan error dan retry. Logout tersedia juga saat melihat pesanan/ringkasan/pembayaran/profil toko.
- `role-workspace.tsx` dan CSS: sidebar desktop sticky, menu dialog mobile/tablet, fokus kembali, tutup saat pindah ke desktop, dan kontrol keluar konsisten. `modal.tsx` memperbesar target tombol tutup.
- `partner-orders.tsx`, `partner-inventory.tsx`: filter yang ringkas, countdown dalam jam/menit, aksi verifikasi/batal berdampingan, dan inventaris dua kolom pada HP. Default semua tanggal pesanan tetap dipertahankan.
- `store-form.tsx`, `partner-store-profile.tsx`: pilihan cabang dan aksi tambah tetap satu baris, navigasi bagian form, serta tata letak jadwal yang kompak. Tidak menyembunyikan field wajib atau mengubah validasi.

## Verifikasi

- Delapan kasus pada `responsive-navigation.spec.ts` mencakup 360/390/768/1024/1440 px dalam light/dark: guest, pembeli, seluruh subhalaman mitra, admin, header, posisi tombol, scroll status terakhir, filter, menu/Escape/fokus/resize, jadwal, akun, logout nyata dan retry saat logout gagal.
- 52 kasus regresi relevan mencakup landing publik, pesanan pembeli, inventory CRUD, proteksi tiket, crop/draf/media, profil multi-cabang/geocoding, akun dan moderasi, tema serta kontras. Seluruh kasus lulus setelah koreksi dan pengulangan kasus terdampak.
- Lint, TypeScript, build produksi Webpack dan `git diff --check` lulus. Backend tidak diubah untuk revisi responsif ini.
- Akun dan transaksi uji menggunakan backend/database/media sementara. Fixture jam tutup dibuat relatif terhadap waktu tes agar data toko uji tetap valid ketika tes berjalan setelah 23.00 WIB; ini tidak mengubah data toko pengguna.
- Playwright CLI merekam screenshot perbandingan dan memeriksa tampilan. Guest `403 auth/me` adalah keadaan belum login; peringatan preload font/CSS Next.js masih dapat muncul. Screenshot dan data browser tidak masuk source.

Batas verifikasi: memakai emulasi viewport Chromium; belum menguji perangkat iOS/Android fisik atau VoiceOver/TalkBack. Pemeriksaan ini tidak menyatakan audit aksesibilitas WCAG penuh.
