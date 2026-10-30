# HABISIN

[![CI](https://github.com/HabisinID/habisin/actions/workflows/ci.yml/badge.svg)](https://github.com/HabisinID/habisin/actions/workflows/ci.yml)

> **Save Food, Cut Waste, Feed Communities.**

Web app berbasis peta interaktif (map-first progressive web app) yang mempertemukan gerai makanan berlebih dengan masyarakat sekitar. Melalui transparansi geolokasi dan reservasi instan, HABISIN memfasilitasi penebusan makanan surplus dengan diskon signifikan maupun klaim donasi gratis sebelum batas waktu operasional berakhir.

**Kategori:** Web App Berbasis Peta Interaktif (Map-First PWA)
**Domain Masalah:** Food Waste Management, Environmental Sustainability

Ruang kerja mitra, pesanan, profil cabang, dan moderasi minimum: [cakupan/API/batas fitur](docs/partner-workspace-revision.md).

**Mulai di sini:** [Setup lokal](#menjalankan-demo-lokal) · [Konfigurasi](#konfigurasi-environment) · [Verifikasi](#verifikasi) · [Troubleshooting](#troubleshooting)

---

## Latar Belakang

Indonesia menghadapi tantangan besar terkait *food loss and waste* (FLW). Berdasarkan laporan Bappenas, timbulan sampah makanan di Indonesia mencapai **23–48 juta ton per tahun**, dengan sektor konsumsi (restoran, kafe, katering, gerai ritel modern) sebagai salah satu kontributor terbesar di area perkotaan.

Penumpukan makanan layak santap di Tempat Pembuangan Akhir (TPA) membuang sumber daya sekaligus memperburuk krisis iklim melalui pelepasan gas metana (CH₄). Berdasarkan data [Kementerian Lingkungan Hidup 2025](https://sampahnasional.kemenlh.go.id/portal-indikatif/data/komposisi-sampah), komposisi sampah di Indonesia didominasi sisa makanan sebesar **40,16%**.

HABISIN hadir untuk menekan kerugian pelaku usaha, meringankan pengeluaran masyarakat, dan mentransformasikan penanganan food waste menjadi aksi mitigasi emisi gas rumah kaca yang terukur.

---

## Public API

| Layanan | Endpoint / Metode | Kegunaan | Dokumentasi |
|---|---|---|---|
| OpenStreetMap Tile Server | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Sumber tile peta yang dirender oleh Leaflet. | [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) |
| Nominatim (OSM) | `GET https://nominatim.openstreetmap.org/search?q={alamat}&format=json` | Mengubah teks alamat toko menjadi koordinat (lat, lng) saat onboarding mitra. | [Nominatim Search API](https://nominatim.org/release-docs/latest/api/Search/) |
| Cloudinary | `POST https://api.cloudinary.com/v1_1/{cloud_name}/image/upload` | Menyimpan gambar makanan surplus dan avatar pengguna. | [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference) |
| Supabase Storage (alternatif) | Supabase JS SDK / REST API | Alternatif penyimpanan gambar jika Cloudinary tidak digunakan. | [Supabase Storage Docs](https://supabase.com/docs/guides/storage) |

> **Catatan penggunaan:** Tile server OSM dan Nominatim adalah layanan publik dengan kebijakan pemakaian wajar. Nominatim dibatasi maksimal sekitar 1 permintaan per detik dan mewajibkan identitas aplikasi (User-Agent/Referer) yang jelas.

## Client-Side Library & Web API Browser

| Library / API | Jenis | Kegunaan | Dokumentasi |
|---|---|---|---|
| Leaflet.js | Library JavaScript (NPM) | Merender peta interaktif, marker toko, dan popup informasi. | [Leaflet Reference](https://leafletjs.com/reference.html) |
| qrcode.react | Library React (NPM) | Menghasilkan QR tiket klaim langsung di browser pembeli, tanpa API eksternal. | [qrcode.react](https://www.npmjs.com/package/qrcode.react) |
| HTML5 Geolocation API | Web API bawaan browser | Mendeteksi posisi pengguna untuk perhitungan jarak dan radius terdekat. | [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API) |

> **Catatan pembayaran:** HABISIN menggunakan simulasi pembayaran (mock payment) di sisi aplikasi untuk mengubah status pesanan. Tidak ada integrasi payment gateway atau transaksi uang sungguhan.

---

## Daftar Modul & Pembagian Tugas

Aplikasi dibagi menjadi **10 modul mandiri (zero-dependency)** untuk 5 anggota. Setiap anggota mengelola minimal satu entitas dengan operasi **CRUD lengkap** (Create, Read, Update, Delete).

### Rozan Laudzai — Identity & Partner Location

- **Modul 1 — Autentikasi & Manajemen Pengguna (Role-Based)**
  Registrasi, login, logout, dan penyimpanan token sesi untuk 3 role (Pembeli, Mitra, Admin). Cek ketersediaan username secara real-time (AJAX). Halaman profil pengguna, form edit profil, form ganti password, serta fitur **hapus akun** dengan konfirmasi password.
- **Modul 2 — Onboarding Mitra & Geocoding Lokasi Toko**
  Form pendaftaran toko (nama, deskripsi, alamat teks, jam operasional). Integrasi Nominatim API untuk mengubah alamat teks menjadi koordinat (lat, lng) yang tersimpan di database. Antarmuka peta mini (Leaflet) agar mitra dapat mengonfirmasi posisi pin tokonya. Halaman profil toko, form **edit data toko** (termasuk geocoding ulang saat alamat berubah), dan fitur **hapus/tutup toko**.

### Christiano Hosea — Surplus Catalog & Map Explorer

- **Modul 3 — Manajemen Produk Makanan Surplus (CRUD Mitra)**
  Form pembuatan listing makanan (nama, foto, deskripsi, harga normal, harga diskon/gratis, jumlah stok porsi, batas waktu pengambilan). Tabel manajemen produk di sisi mitra untuk melihat semua listing, **edit data listing**, ubah stok manual, nonaktifkan sementara, dan **hapus listing** secara permanen.
- **Modul 4 — Peta Sebaran Makanan Interaktif (Leaflet)**
  Halaman peta utama yang memplot marker lokasi toko berdasarkan data koordinat (lat, lng). Deteksi koordinat pengguna via browser GPS (`navigator.geolocation`). Popup ringkas saat marker diklik: nama toko, jarak relatif, dan tombol langsung ke halaman toko (AJAX).

### Damica Adreeza Ramadhan — Search & Admin Moderation

- **Modul 5 — Pencarian Katalog & Filter Makanan**
  Kolom pencarian teks nama makanan/toko (AJAX). Komponen filter: pilihan kategori makanan, rentang harga, dan filter biner ("Hanya Tampilkan Donasi Gratis"). Tampilan daftar kartu produk (product card list) responsif dengan indikator harga diskon.
- **Modul 6 — Panel Kontrol & Moderasi Admin**
  Halaman tabel admin untuk melihat daftar mitra baru dan tombol persetujuan (Approve/Reject). Tabel daftar listing publik dengan tombol darurat Take-Down jika isi listing melanggar aturan. **Moderation Log (CRUD):** setiap tindakan moderasi otomatis tercatat bersama alasannya (Create), admin dapat melihat dan memfilter riwayat log (Read), mengedit catatan atau alasan moderasi (Update), dan menghapus entri log (Delete).

### Violin Monica — Booking & Digital Ticket

- **Modul 7 — Alur Pemesanan & Mock Payment**
  Halaman ringkasan pemesanan (input jumlah porsi, catatan pengambilan, menampilkan jarak toko dengan lokasi pembeli). Fitur **edit pesanan** sebelum dibayar (ubah jumlah porsi dan catatan pengambilan). Halaman simulasi pembayaran (mock payment screen) dengan tombol instan "Simulasikan Pembayaran Berhasil" yang langsung mengubah status transaksi menjadi lunas/terpesan. Fitur **batal pesanan** yang mengembalikan stok, serta **hapus pesanan** yang sudah selesai atau dibatalkan dari riwayat.
- **Modul 8 — Tiket Digital & Verifikasi Kode Kasir**
  Halaman tiket digital pembeli yang menampilkan ringkasan pesanan, batas jam ambil, kode klaim unik 5 karakter acak (misal: H7B29), dan QR code berisi kode tersebut. Halaman verifikasi kasir di sisi mitra untuk memasukkan kode klaim, memvalidasi kecocokannya, dan mengubah status pesanan menjadi selesai diambil (AJAX).

### Raihan Daffa Aprilianda — Reputation & Impact Dashboard

- **Modul 9 — Rating Toko & Sistem Komplain (Ulasan)**
  Form rating bintang (1–5) dan ulasan produk untuk pembeli yang sudah mengambil pesanan. Rating toko dihitung dari ulasan produknya. Pembeli dapat mengedit/menghapus ulasannya sendiri, membuat komplain untuk pesanan yang memenuhi syarat, dan melihat statusnya. Admin meninjau komplain dan dapat menurunkan listing yang dilaporkan.
- **Modul 10 — Dasbor Statistik & Kalkulator Dampak Lingkungan**
  Halaman metrik dampak lingkungan publik: akumulasi total porsi makanan terselamatkan, total kilogram sampah terhindarkan (W), dan estimasi penurunan gas rumah kaca (W × 2,5 kg CO₂e). Widget statistik performa penjualan di dasbor mitra (total porsi terselamatkan dan total rupiah terhimpun).

### Matriks CRUD per Anggota

| Anggota | Entitas | Create | Read | Update | Delete |
|---|---|---|---|---|---|
| Rozan Laudzai | Akun Pengguna | Registrasi akun | Halaman profil | Edit profil & ganti password | Hapus akun |
| Rozan Laudzai | Toko Mitra | Pendaftaran toko + geocoding | Profil toko & pin peta | Edit data toko & geocoding ulang | Hapus/tutup toko |
| Christiano Hosea | Listing Makanan | Buat listing | Tabel produk mitra & peta | Edit listing, ubah stok, nonaktifkan | Hapus listing |
| Damica Adreeza Ramadhan | Moderation Log | Catat tindakan moderasi | Riwayat & filter log | Edit catatan/alasan | Hapus entri log |
| Violin Monica | Reservasi/Pesanan | Buat pesanan | Ringkasan & tiket digital | Edit pesanan, status bayar, verifikasi kasir | Batal & hapus dari riwayat |
| Raihan Daffa Aprilianda | Ulasan & Komplain | Tulis ulasan/komplain | Rating toko, ulasan sendiri, status komplain sendiri | Edit ulasan sendiri | Hapus ulasan sendiri |

---

## Peran Pengguna

### Pembeli
Pengguna umum yang mencari dan memesan makanan surplus dari gerai di sekitarnya. Hak akses & fitur:
- Menjelajah peta sebaran makanan surplus.
- Mencari dan memfilter katalog makanan.
- Memesan, mengedit, dan membatalkan pesanan serta melakukan mock payment.
- Mengklaim tiket digital dengan kode klaim unik.
- Memberi, mengedit, dan menghapus ulasan sendiri; membuat laporan komplain dan memantau statusnya.

### Mitra
Pemilik atau pengelola gerai makanan yang ingin mendaftarkan dan mengelola tokonya di platform. Hak akses & fitur:
- Mendaftarkan, mengedit, dan menutup toko (nama, deskripsi, alamat, jam operasional) dengan geocoding lokasi.
- Mengelola listing makanan surplus (tambah, edit, ubah stok, nonaktifkan, hapus).
- Menetapkan harga normal, harga diskon, atau donasi gratis.
- Memverifikasi kode klaim di sisi kasir.
- Memantau statistik performa penjualan dan porsi terselamatkan.

### Admin
Admin platform yang mengatur dan memantau seluruh aktivitas di sistem. Hak akses & fitur:
- Menyetujui atau menolak pendaftaran mitra baru.
- Memoderasi listing publik yang beredar.
- Melakukan take-down konten yang melanggar aturan.
- Mengelola moderation log (CRUD).
- Memantau seluruh aktivitas platform.

---

## Tim Pengembang

### Kelompok 10 PBP B

| Nama | Tanggung Jawab | NPM |
|------|----------------|-----|
| Rozan Laudzai | Identity & Partner Location | 2506547544 |
| Christiano Hosea | Surplus Catalog & Map Explorer | 2506615280 |
| Damica Adreeza Ramadhan | Search & Admin Moderation | 2506625193 |
| Violin Monica | Booking & Digital Ticket | 2506551794 |
| Raihan Daffa Aprilianda | Reputation & Impact Dashboard | 2506620021 |

---

## Menjalankan Demo Lokal

Demo sudah mencakup autentikasi Django + DRF, katalog makanan, Leaflet/OpenStreetMap,
pencarian/filter, favorit lokal, pemesanan dengan simulasi pembayaran, tiket pengambilan,
pengelolaan listing mitra, dan pembatalan pesanan. Antarmuka tersedia dalam Bahasa
Indonesia dan responsif.

### Prasyarat

- Python **3.10 atau lebih baru** dengan `pip` dan modul `venv` (pengembangan diuji dengan Python 3.12).
- Node.js **20.9 atau lebih baru** dan npm, sesuai persyaratan Next.js yang digunakan.
- Git dan terminal Bash (Linux, macOS, atau WSL).
- Koneksi internet untuk instalasi dependensi, foto Unsplash, dan tile OpenStreetMap.

Database menggunakan **SQLite** di `backend/db.sqlite3`; tidak perlu menyiapkan server
PostgreSQL atau layanan database lain. Demo juga tidak memerlukan API key eksternal.

Semua blok perintah di bawah dimulai dari **root repository**, kecuali disebutkan lain.
Gunakan dua terminal terpisah untuk backend dan frontend. Jika `.venv`, `.env`, atau
`.env.local` sudah ada, lewati perintah pembuatannya agar konfigurasi lokal tetap terjaga.

### Instalasi pertama — backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_demo
python manage.py collectstatic --noinput
python manage.py runserver 127.0.0.1:8000
```

Biarkan terminal ini tetap berjalan. Migrasi membuat tabel SQLite; `collectstatic`
menyiapkan aset statis Django admin. Selalu aktifkan `.venv` sebelum menjalankan
perintah Python backend.

`seed_demo` membuat atau memperbarui **enam listing contoh**, mengatur ulang stoknya,
dan membuka waktu pengambilan selama **delapan jam** sejak perintah dijalankan.
Pesanan yang belum dibayar lebih dari lima menit atau sudah melewati batas ambil
otomatis menjadi **Kedaluwarsa** sebelum seed berjalan. Perintah tetap menolak
pembaruan jika masih ada pesanan aktif yang belum lewat batas; batalkan melalui
**Pesanan saya** sebelum menjalankan ulang seed.
Seed menolak benturan ID listing milik mitra; seluruh operasi dibatalkan atomik.

Untuk demo penilaian PWS, gunakan batas ambil eksplisit agar listing tetap tampil
sepanjang **20 November 2026 (WIB)**:

```bash
python manage.py seed_demo --pickup-end '2026-11-21T00:00:00+07:00'
```

Jalankan dari direktori backend pada lingkungan/database PWS setelah kode ini
terdeploy. Opsi ini hanya memperbarui enam listing demo, bukan listing milik mitra.
Deadline harus di masa depan dan menyertakan zona waktu. Tanpa opsi tersebut,
default tetap delapan jam. Menjalankan ulang tanpa opsi akan mengembalikan batas
ambil ke delapan jam. Jangan pasang seed sebagai perintah startup otomatis karena
seed juga mengatur ulang stok dan menolak pesanan aktif.

Nama toko, produk, dan koordinat adalah ilustrasi, bukan inventaris atau kemitraan nyata.
Tidak ada akun dengan password bawaan. Buat akun dari tombol **Daftar gratis**.

### Seed 40 toko demo sekitar Depok

Dari direktori Django pada deployment PWS, setelah command ini terdeploy:

```bash
python manage.py seed_depok_stores
```

Untuk menambahkan satu listing per toko agar muncul pada katalog/peta discovery,
gunakan deadline eksplisit (contoh: tersedia sepanjang 20 November 2026 WIB):

```bash
python manage.py seed_depok_stores --with-listings --pickup-end '2026-11-21T00:00:00+07:00'
```

Command membuat 40 toko fiktif berlabel `[DEMO]` di sepuluh area Depok, dengan
koordinat ilustrasi tanpa memanggil geocoder. Pemilik demo khusus berstatus
inactive dengan password yang tidak dapat dipakai login. Data tidak memakai ID
toko/listing tetap dan tidak mengambil alih akun yang kebetulan bernama sama.
Pengulangan hanya menambahkan entri yang belum ada; stok, deadline, status buka,
listing yang dihapus/dimoderasi, dan pesanan yang sudah ada tidak direset.
Opsi deadline berlaku untuk listing baru saja; pengulangan tidak memperpanjang
listing lama. Tanpa listing yang aktif, berstok, dan belum kedaluwarsa, toko tidak
muncul pada discovery. Jangan menjalankan suite tes pada database PWS.

### Instalasi pertama — frontend

Buka terminal kedua dari root repository:

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Buka **http://localhost:3000**. Next.js meneruskan `/api/*` ke Django, sehingga browser
menggunakan satu origin untuk halaman dan autentikasi. Gunakan hostname yang sama
selama sesi; cookie untuk `localhost` dan `127.0.0.1` terpisah.

| Layanan | Alamat lokal |
| --- | --- |
| Website | http://localhost:3000 |
| Katalog API melalui frontend | http://localhost:3000/api/listings |
| Katalog API langsung dari Django | http://127.0.0.1:8000/api/listings |
| Django admin | http://127.0.0.1:8000/admin/ |

Foto ilustrasi dan tile peta membutuhkan internet. Jika backend tidak tersedia,
katalog pratinjau tetap tampil dengan pesan yang jelas; autentikasi dan pemesanan
membutuhkan backend aktif.

### Menjalankan kembali setelah instalasi

Terminal backend, dari root repository:

```bash
cd backend
source .venv/bin/activate
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

Terminal frontend, dari root repository:

```bash
cd frontend
npm run dev
```

Untuk memperbarui katalog yang kedaluwarsa, batalkan reservasi aktif terlebih dahulu,
lalu jalankan dari terminal baru di root repository:

```bash
cd backend
source .venv/bin/activate
python manage.py seed_demo
```

Hentikan masing-masing server dengan `Ctrl+C`. Data akun dan pesanan tetap tersimpan
di SQLite. Instal ulang dependensi hanya saat file requirements atau lockfile berubah.

### Konfigurasi environment

Contoh tersedia di [`backend/.env.example`](backend/.env.example) dan
[`frontend/.env.example`](frontend/.env.example). File konfigurasi lokal tidak di-commit.
Restart server terkait setelah mengubah konfigurasi.

| File | Variabel | Nilai untuk demo lokal | Kegunaan |
| --- | --- | --- | --- |
| `backend/.env` | `DEBUG` | `True` | Mengaktifkan mode pengembangan dan cookie untuk HTTP lokal. |
| `backend/.env` | `SECRET_KEY` | Nilai contoh khusus demo lokal | Kunci Django; ganti dengan nilai acak yang kuat sebelum deployment. |
| `backend/.env` | `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Hostname yang diterima Django, tanpa skema atau port. |
| `backend/.env` | `CSRF_TRUSTED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Origin frontend yang diizinkan mengirim mutasi API. |
| `backend/.env` | `NOMINATIM_URL` | `https://nominatim.openstreetmap.org/search` | Endpoint geocoding yang dapat diganti tanpa perubahan kode. |
| `backend/.env` | `NOMINATIM_USER_AGENT` | `HABISIN/1.0 (partner store onboarding)` | Identitas aplikasi untuk geocoder; tambahkan kontak pengelola saat deployment. |
| `frontend/.env.local` | `BACKEND_URL` | `http://127.0.0.1:8000` | Alamat Django untuk proxy Next.js, tanpa akhiran `/api` atau `/`. |

Jika port backend berubah, sesuaikan `BACKEND_URL`. Jika origin frontend berubah
(misalnya menjadi port 3001), tambahkan origin tersebut ke `CSRF_TRUSTED_ORIGINS`.
Pisahkan beberapa nilai dengan koma tanpa spasi.

### Alur demo

1. Daftar sebagai **Pembeli**. Ketersediaan username diperiksa otomatis.
2. Cari/filter makanan, simpan favorit, atau pilih marker toko di tampilan **Peta**.
   Tombol lokasi meminta izin GPS dan menghitung ulang jarak dari lokasi pengguna.
3. Buka produk, pilih jumlah porsi dan catatan pengambilan, lalu pilih
   **Lanjut ke ringkasan**. Di halaman ringkasan, ubah porsi atau catatan bila perlu,
   pilih **Bayar**, lalu **Simulasikan pembayaran berhasil**. Tidak ada pembayaran
   sungguhan; stok ditahan sejak pesanan dibuat dan kode tiket tersimpan di SQLite.
4. Buka **Pesanan** di header untuk melanjutkan pembayaran, melihat kode tiket,
   membatalkan pesanan, atau menghapus pesanan selesai/dibatalkan dari riwayat.
   Pembatalan mengembalikan stok dan tidak bisa menggandakan pengembalian stok. Lihat
   [panduan Modul 7](docs/module-7.md) untuk status pesanan dan API pemesanan.
5. Klik nama akun untuk mengubah profil/password atau menghapus akun dengan
   konfirmasi password. Penghapusan akun membatalkan pesanan dan mengembalikan stok.

Akun **Mitra** dapat mendaftar dan mengelola listing miliknya melalui **Dasbor mitra**
di header desktop atau **Kelola listing** pada banner mitra di mobile.
Akun **Mitra** dapat mendaftarkan dan mengelola toko melalui `/partner/store`.
Lihat [panduan Modul 2](docs/module-2.md) untuk alur onboarding, API toko, dan
kebijakan penggunaan Nominatim. Jalankan migrasi backend sebelum membuka fitur ini.
Akun **Admin** hanya dibuat/ditetapkan lewat Django, bukan form publik:

```bash
cd backend
source .venv/bin/activate
python manage.py createsuperuser
```

Login admin tersedia di `http://127.0.0.1:8000/admin/`. Gunakan username huruf kecil
agar akun juga dapat digunakan melalui form login frontend.
Admin Django dapat mengelola listing, profil peran, dan melihat reservasi.
Jangan mengubah stok/status reservasi secara manual ketika menguji alur stok.

### Pengelolaan listing mitra (Modul 3)

1. Daftar/pilih peran **Mitra**, lalu buka pengelolaan listing.
2. Daftarkan satu atau beberapa toko melalui **Toko**, lalu klik **Tambah listing**.
   Pilih **Toko penjual** secara eksplisit; alamat dan pin pengambilan berasal dari
   toko tersebut dan tidak dapat diketik ulang pada listing. Isi nama makanan, kategori,
   deskripsi, stok, foto, harga, **Makanan dibuat (WIB)**, dan jendela pengambilan dalam **WIB**.
   Kemasan, Disimpan, dan Mengandung/alergen opsional (maksimal 500 karakter masing-masing).
   Jika belum memiliki toko, buka tautan pendaftaran pada tab baru lalu pilih **Muat ulang toko**; draft listing tetap tersedia.
3. Masukkan harga normal dan harga jual (harga berbayar baru/perubahan harga harus lebih rendah dari harga normal),
   atau aktifkan **Gratis (donasi)** untuk harga nol. Klik **Tayangkan listing**.
4. Gunakan **Ubah** untuk memperbarui detail atau stok tersedia. Stok ini adalah sisa porsi
   yang dapat dipesan; pembatalan pesanan mengembalikan porsi ke stok tersebut.
5. **Nonaktifkan** menyembunyikan listing dari katalog dan mencegah pesanan baru tanpa
   membatalkan pesanan yang sudah masuk. **Aktifkan** menawarkannya kembali selama belum kedaluwarsa.
6. **Hapus** memerlukan konfirmasi dan hanya berlaku jika listing belum memiliki riwayat
   reservasi. Listing ber-riwayat harus dinonaktifkan. Harga, alamat/koordinat, dan waktu ambil
   tidak dapat diubah selama ada reservasi aktif. Toko penjual juga tidak dapat diganti;
   perubahan nama/alamat/pin pada profil toko ditolak selama cabang memiliki pesanan aktif.

Inventaris menampilkan seluruh listing milik akun, termasuk nonaktif, habis, dan kedaluwarsa.
Listing demo lama tidak memiliki pemilik dan tidak otomatis masuk ke inventaris akun baru.
Listing lama tanpa `store_id` tetap dapat dibaca; pemilik harus menautkan toko secara
eksplisit saat mengedit. Sistem tidak menebak hubungan berdasarkan nama toko.
Saat toko ditutup sementara, listing cabang itu tidak ditawarkan dan pesanan baru ditolak,
tanpa membatalkan pesanan lama. Toko yang masih dirujuk listing tidak dapat dihapus;
nonaktifkan/tutup sementara atau selesaikan hubungan listing terlebih dahulu.
Jika akun mitra dihapus, listing miliknya dinonaktifkan dan tautan toko dilepas;
nama/alamat/pin terakhir serta riwayat pesanan pembeli tetap dipertahankan.

API mitra memakai sesi dan CSRF yang sama dengan autentikasi aplikasi:

| Endpoint | Metode | Perilaku |
| --- | --- | --- |
| `/api/partner/listings` | GET, POST | Inventaris sendiri dan buat listing |
| `/api/partner/listings/:id` | GET, PATCH, DELETE | Baca, ubah, dan hapus listing sendiri |

Payload create listing mewajibkan `store_id` milik mitra dan `prepared_at` (tidak di masa depan atau setelah deadline). `packaging`, `storage_notes`, dan `allergens` opsional. Listing lama tetap nullable tanpa backfill rekaan, PATCH parsial kompatibel; `store`, `address`,
`latitude`, dan `longitude` adalah field baca, kiriman manual ditolak. Respons
menambah `store_id` dan ringkasan publik `store_summary` tanpa data akun pemilik.
Server menetapkan pemilik dari sesi, membatasi akses ke peran mitra, dan menolak akses
lintas akun. Endpoint publik `/api/listings` tetap tersedia untuk katalog pembeli.

### Foto listing: URL dan upload

Pilih salah satu sumber foto; foto wajib sebelum listing ditayangkan. URL publik
HTTP/HTTPS tetap didukung. Upload menerima JPEG, PNG, atau WebP statis; sumber
maksimal 10 MiB/20 megapiksel, lalu konfirmasi crop **4:3** (400×300 sampai
1600×1200 piksel, tanpa memperbesar foto kecil). File hasil maksimal 5 MiB.
Server memeriksa isi file, menyimpan JPEG yang dinormalisasi tanpa EXIF/GPS,
dan menolak file rusak, animasi, GIF, SVG, serta HEIC. Konversikan HEIC sebelum
memilih file. Foto asli tidak disimpan untuk editing permanen.

POST/PATCH listing menerima JSON untuk URL (`image_source: "url"`, `image`) atau
multipart untuk upload (`image_source: "upload"`, `image_file`); jangan kirim kedua
sumber sekaligus. PATCH yang tidak menyertakan field foto mempertahankan foto lama.
Respons `image` selalu URL efektif yang bisa ditampilkan, ditambah `image_source`.
Foto lama tidak dihapus sebelum penggantian tersimpan; validasi atau storage gagal
mempertahankan listing/foto sebelumnya.

Media development memakai `backend/media` (sudah diabaikan Git) dan `/media/` dari
Django saat `DEBUG=True`, diproxy oleh Next.js. `MEDIA_ROOT` dapat menunjuk lokasi
lain. Deployment memerlukan direktori/volume persisten serta penyajian media yang
sesuai; WhiteNoise menangani static, bukan upload pengguna. Storage dapat diganti
melalui konfigurasi Django `STORAGES`; belum ada layanan cloud yang dikonfigurasi.

Rekonsiliasi foto yang tidak lagi dirujuk, dari folder `backend`:

```bash
python manage.py cleanup_listing_media
```

Default hanya **dry-run** dan hanya memeriksa file dalam namespace `listings/`
yang berusia setidaknya 24 jam. Setelah meninjau hasilnya, operator dapat memakai
`--delete`. File yang masih dirujuk listing tetap dipertahankan. Jangan jalankan
cleanup pada media pengguna sebagai bagian tes; tes memakai direktori sementara.

### Cakupan autentikasi

- Registrasi pembeli/mitra, login, logout, sesi persisten tujuh hari.
- Cookie sesi `HttpOnly` dan `SameSite=Lax`; semua mutasi API, termasuk login dan
  registrasi, memerlukan CSRF token. Token sesi tidak disimpan di `localStorage`.
- Password di-hash oleh Django dan divalidasi dengan validator bawaan Django.
- Username unik tanpa membedakan huruf besar/kecil untuk registrasi aplikasi.
- Perubahan password mempertahankan sesi saat ini dan mencabut sesi lainnya.
- Server membatasi akses berdasarkan peran, kepemilikan pesanan, dan kepemilikan listing mitra.
- Pembatasan percobaan login/registrasi anonim: 30 permintaan per menit per IP
  melalui cache lokal DRF (konfigurasi cache bersama diperlukan untuk multi-worker).

### Status implementasi

Fitur akun, onboarding toko, listing, discovery, pemesanan, tiket, ulasan, dan komplain
tersedia. Admin dapat meninjau komplain, persetujuan mitra, listing, dan log moderasi.
Bagian statistik performa penjualan mitra pada Modul 10 juga tersedia; rinciannya ada di
[docs/module-10.md](docs/module-10.md). PWA offline juga belum diimplementasikan. Katalog awal berisi data demo; akun
mitra dapat membuat listing sendiri. Modul 4 menyediakan popup toko, katalog profil
toko, deep link makanan, dan lifecycle peta yang mempertahankan viewport.

### Dari pesanan sampai diambil (Modul 7–8)

Pembeli membayar, membuka tiket, lalu kasir mencocokkan kodenya. Detail ada di
[docs/module-7.md](docs/module-7.md) dan [docs/module-8.md](docs/module-8.md).

| Pesanan saya | Tiket digital |
| --- | --- |
| ![Pesanan saya dengan kode dan tombol Lihat tiket](docs/screenshots/modul-8/01-pesanan-saya.png) | ![Tiket berisi QR, kode, linimasa, dan Buka rute](docs/screenshots/modul-8/02-tiket.png) |

| Kasir: kode cocok | Kasir: diserahkan, bisa diurungkan 60 detik |
| --- | --- |
| ![Halaman kasir menampilkan Kode cocok](docs/screenshots/modul-8/03-kasir-kode-cocok.png) | ![Halaman kasir setelah Tandai sudah diambil](docs/screenshots/modul-8/04-kasir-diserahkan.png) |

| Kasir: kode yang sama ditolak | Tiket pembeli ikut berubah |
| --- | --- |
| ![Kode yang sama ditolak karena sudah dipakai](docs/screenshots/modul-8/05-kasir-sudah-dipakai.png) | ![Tiket menampilkan Sudah dipakai dan kode dicoret](docs/screenshots/modul-8/06-tiket-sudah-dipakai.png) |

### Ulasan dan penanganan komplain (Modul 9)

Pembeli dapat mengulas produk setelah pesanan diambil, mengurutkan ulasan di halaman
toko, dan mengelola laporan komplain. Admin meninjau laporan, menandai progres, atau
menurunkan listing yang dilaporkan. Panduan alur, API, keamanan, dan tes ada di
[docs/module_9.md](docs/module_9.md).

### Performa penjualan mitra (Bagian Modul 10)

Dashboard mitra memisahkan porsi berbayar yang sudah diambil, nilai transaksi simulasi,
dan porsi donasi gratis yang sudah diambil. Grafik menunjukkan porsi berbayar yang
diambil per hari selama tujuh hari terakhir. Statistik ini tidak menghitung pesanan
batal atau yang belum diambil. Kalkulator dampak lingkungan publik belum termasuk;
lihat [docs/module-10.md](docs/module-10.md) untuk definisi, rentang tanggal, dan tes.

### Verifikasi

**CI otomatis.** Setiap pull request dan push ke `main` menjalankan
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) di GitHub Actions:

| Job | Isi |
| --- | --- |
| Backend | SQLite: pemeriksaan dengan RuntimeWarning sebagai error, cek dan terapkan migrasi, tes Django dengan coverage minimal 90% |
| PostgreSQL | PostgreSQL 16: konfigurasi produksi, pemeriksaan dan migrasi, seluruh tes Django termasuk upgrade migrasi dan pelestarian data |
| Frontend | ESLint, TypeScript, dan `next build` |
| End-to-end | Backend disposable (`serve-backend.py`) dan build produksi Next.js, lalu semua tes Playwright; `test.only` dan tes flaky menggagalkan CI |

Setiap job dibatasi 20 menit. Laporan XML coverage tersedia sebagai artifact
`backend-coverage`; log Django/Next.js, trace kegagalan, dan laporan HTML Playwright
tersedia sebagai `e2e-debug`, termasuk saat retry berhasil. Artifact disimpan 7 hari.
Backend browser memakai database/media sementara dan batas login khusus tes;
fixture mitra disetujui lewat API admin dengan akun sementara. Untuk menjalankan
tes mitra secara lokal, set `HABISIN_TEST_ADMIN_PASSWORD` yang sama pada proses
`serve-backend.py` dan Playwright; pada proses Playwright set juga
`E2E_ADMIN_USERNAME=workspace_admin` dan `E2E_ADMIN_PASSWORD` dengan sandi yang
sama agar helper persetujuan memakai akun sementara tersebut. Pengaturan rate
limit produksi tetap berlaku
di aplikasi asli. Jangan merge PR
dengan CI merah. Atur branch protection di GitHub agar keempat job wajib lulus
dan PR mendapat review rekan; CodeRabbit tetap menjadi masukan tambahan.

Untuk menjalankan pemeriksaan yang sama secara lokal, jalankan setiap blok dari root
repository. Tes backend memakai database tes terpisah.

```bash
cd backend
source .venv/bin/activate
python manage.py test
python manage.py check
python manage.py makemigrations --check --dry-run
```

Untuk mengukur coverage tes backend, instal dependensi pengembangan sekali, lalu
jalankan dari `backend` dengan `.venv` aktif:

```bash
python -m pip install -r requirements-dev.txt
coverage run manage.py test
coverage report
```

```bash
cd frontend
npm run lint
npm run build
```

Untuk tes browser, hentikan backend kerja pada port 8000. Jalankan backend sementara
(dari folder `backend`) dengan `.venv/bin/python ../frontend/tests/serve-backend.py`.
Pertahankan frontend pada port 3000, lalu jalankan tes dari terminal ketiga:

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

Tes browser membutuhkan backend sementara dan frontend aktif di `127.0.0.1:8000` dan
`127.0.0.1:3000`; harness menyediakan katalog yang belum kedaluwarsa. Tes membuat akun
sementara, menguji alur reservasi, lalu menghapus akun tersebut. Screenshot pemeriksaan
tersimpan di `/tmp/habisin-desktop.png` dan `/tmp/habisin-mobile.png`. Tes Modul 3
mencakup CRUD, validasi, donasi, konflik reservasi, loading/error/retry, dan layout mobile;
screenshot-nya memakai prefix `/tmp/habisin-module3-`.

### Troubleshooting

| Masalah | Langkah penyelesaian |
| --- | --- |
| `No module named django` | Masuk ke `backend`, aktifkan `source .venv/bin/activate`, lalu jalankan `python -m pip install -r requirements.txt`. |
| `No module named venv` atau pembuatan virtual environment gagal | Instal dukungan `venv` untuk Python dari package manager sistem, lalu ulangi pembuatan `.venv`. |
| `no such table` | Jalankan `python manage.py migrate` dari `backend` dengan `.venv` aktif. |
| “Backend belum terhubung” atau proxy gagal | Pastikan Django berjalan di port 8000 dan `BACKEND_URL` sesuai; restart frontend setelah mengubah environment. |
| Katalog kosong saat backend aktif | Listing mungkin belum di-seed atau sudah kedaluwarsa. Batalkan reservasi aktif, lalu jalankan `python manage.py seed_demo`. |
| Seed menolak karena reservasi aktif | Masuk ke akun pemesan dan batalkan pesanan melalui **Pesanan saya**, lalu ulangi seed. |
| Login atau registrasi gagal dengan CSRF 403 | Pastikan origin browser tercantum dalam `CSRF_TRUSTED_ORIGINS`, gunakan `DEBUG=True` untuk HTTP lokal, lalu restart Django dan muat ulang halaman. |
| Port 3000 sudah dipakai | Hentikan proses yang memakai port itu, atau sesuaikan origin CSRF jika memakai port lain. Tes browser tetap mengharapkan port 3000. |
| Chromium gagal karena library sistem belum tersedia | Dari `frontend`, jalankan `npx playwright install --with-deps chromium`; pemasangan dependensi sistem dapat meminta akses administrator. |
| Turbopack gagal dengan `binding to a port: Operation not permitted` dalam sandbox | Gunakan `npm run build -- --webpack` untuk build atau `npm run dev -- --webpack` untuk server lokal. Tidak perlu mengubah konfigurasi proyek. |
| Lokasi GPS ditolak | Izinkan akses lokasi di browser. Jika tidak tersedia, demo tetap memakai lokasi pencarian awal di Beji, Depok. |
| Foto atau peta tidak tampil | Periksa koneksi internet dan pemblokiran permintaan ke Unsplash/OpenStreetMap. |

### Build frontend untuk dijalankan lokal

Dengan backend tetap berjalan, dari root repository:

```bash
cd frontend
npm run build
npm run start
```

Hentikan `npm run dev` terlebih dahulu agar port 3000 tersedia. Ini menjalankan build
produksi Next.js secara lokal; backend masih mengikuti konfigurasi environment-nya.

## Deployment — Vercel + PWS

Frontend Next.js berjalan di Vercel; backend Django berjalan di PWS (Pacil Web
Service). SQLite hanya untuk development. Dengan `PRODUCTION=True`, backend
memakai PostgreSQL ITF dan schema yang diberikan kepada proyek.

### 1. Siapkan environment backend PWS

Simpan variabel berikut pada konfigurasi environment proyek PWS, bukan di Git.
Ganti seluruh placeholder dengan domain dan kredensial proyek yang sebenarnya.

```dotenv
PRODUCTION=True
DEBUG=False
SECRET_KEY=<kunci-acak-kuat>
ALLOWED_HOSTS=<domain-pws>,<domain-frontend-vercel>
CSRF_TRUSTED_ORIGINS=https://<domain-frontend-vercel>,https://<domain-pws>
DB_NAME=<nama-database-itf>
DB_USER=<user-database-itf>
DB_PASSWORD=<password-database-itf>
DB_HOST=<host-database-itf>
DB_PORT=5432
SCHEMA=<schema-proyek-itf>
NOMINATIM_USER_AGENT=HABISIN/1.0 (<kontak-pengelola>)
```

Buat `SECRET_KEY` sekali dan simpan untuk deployment berikutnya:

```bash
python -c 'import secrets; print(secrets.token_urlsafe(50))'
```

`ALLOWED_HOSTS` berisi hostname saja, tanpa protokol/path. Origin pada
`CSRF_TRUSTED_ORIGINS` menyertakan `https://`, tanpa trailing slash. Pisahkan nilai
dengan koma tanpa spasi. Sertakan domain Vercel/custom domain yang benar-benar
akan dipakai browser; tambahkan domain Preview tertentu hanya jika diperlukan.
`SCHEMA` wajib ada dan sudah dapat diakses oleh user database ITF; jangan
mengganti nilainya menjadi `public` jika proyek diberi schema sendiri.
Flag produksi yang salah ketik, kredensial tidak lengkap, atau kunci demo lokal
akan menghentikan startup. Cookie sesi dan CSRF memakai secure saat debug mati.

### 2. Publikasikan backend ke PWS

PWS menerima deployment pada branch remote `master`. Nama branch sumber lokal
boleh berbeda: refspec Git menentukan kode yang dikirim. Tutorial PWS menunjukkan
pemetaan `main:master`; lihat [panduan PWS PBP](https://pbp.cs.ui.ac.id/en/tutorial/tutorial-1.html).

Repo ini adalah monorepo: `manage.py` dan `requirements.txt` berada di `backend/`.
Jika proyek PWS sudah memakai konfigurasi monorepo, pertahankan build/start yang
berjalan dari folder itu. Untuk proyek PWS yang mengharapkan Django pada root
repository, publikasikan subtree backend sebagai berikut, dari root repo lokal:

```bash
# Tambahkan sekali; URL persisnya tersedia pada proyek PWS milik tim.
git remote add pws <URL-GIT-PWS>
# Jika remote sudah ada, periksa dengan: git remote get-url pws

# Pastikan main sudah memuat perubahan backend yang lulus CI.
git subtree split --prefix=backend main
# Salin hash commit hasil split pada perintah berikut.
git push pws <HASH-HASIL-SPLIT>:master
```

Perintah push di atas adalah langkah publikasi manual oleh pengelola. Ia mengirim
isi `backend/` sebagai root ke PWS, bukan mengubah branch sumber atau mengirim
frontend. Jika menguji branch fitur, ganti `main` pada perintah split dengan nama
branch tersebut; deployment itu memakai database PWS yang sama. Untuk penggunaan
normal, publikasikan kode yang sudah digabung ke `main`. Jangan mencampur pola
push monorepo penuh dan subtree pada remote yang sama atau memakai force push
untuk melewati penolakan riwayat; periksa dahulu pola deployment tim.

Pada lingkungan build/release PWS, aktifkan virtualenv yang disediakan platform
lalu jalankan dari direktori Django (root hasil subtree, atau `backend/` untuk
monorepo penuh):

```bash
python -m pip install -r requirements.txt
python manage.py check
python manage.py migrate --noinput
python manage.py migrate --check
python manage.py collectstatic --noinput
```

Cadangkan database sebelum migrasi deployment yang mengubah schema. Gunakan WSGI
`habisin.wsgi:application` untuk server aplikasi. Jika PWS meminta start command,
contohnya berikut; sesuaikan port dengan konfigurasi platform:

```bash
gunicorn habisin.wsgi:application --bind 0.0.0.0:<PORT-PWS>
```

Jangan memakai `runserver` untuk produksi. Pastikan build, migrasi, dan startup
berhasil melalui log PWS sebelum menghubungkan frontend. Detail pengisian
build/start mengikuti fasilitas proyek PWS yang tersedia; repository ini belum
menyertakan skrip deployment PWS otomatis.

### 3. Deploy frontend di Vercel

Import repository GitHub sebagai proyek Vercel dengan pengaturan berikut:

| Pengaturan | Nilai |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `frontend` |
| Node.js | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Default Next.js |
| Production Branch | `main` |
| Environment `BACKEND_URL` | `https://<domain-pws>` tanpa `/api` atau trailing slash |

Atur `BACKEND_URL` untuk environment Production; isi Preview juga jika deployment
preview perlu backend. Jangan menaruh kredensial database atau `SECRET_KEY` pada
frontend. Pengaturan root mengikuti [dokumentasi monorepo Vercel](https://vercel.com/docs/monorepos).
Perubahan [environment Vercel](https://vercel.com/docs/environment-variables)
memerlukan deployment baru agar berlaku.

Browser mengakses `/api/*` dan `/media/*` pada domain frontend. Rewrite dalam
`frontend/next.config.ts` meneruskannya ke `BACKEND_URL`; pertahankan pola ini
agar autentikasi sesi tetap lewat origin frontend. Setelah domain Vercel final
tersedia, sesuaikan `CSRF_TRUSTED_ORIGINS` dan `ALLOWED_HOSTS` backend lalu restart
backend jika konfigurasi berubah.

### 4. Seed demo untuk penilaian

Setelah commit yang menambahkan `--pickup-end` terdeploy dan migrasi selesai,
jalankan sekali pada lingkungan Django PWS yang memakai database produksi:

```bash
python manage.py seed_demo --pickup-end '2026-11-21T00:00:00+07:00'
```

Enam listing demo tetap tampil sepanjang **20 November 2026 WIB**, selama masih
aktif dan stoknya tersedia. Seed memperbarui stok dan batas ambil listing demo;
ia menolak benturan ID milik mitra serta pesanan aktif yang belum kedaluwarsa.
Listing milik mitra tidak diperpanjang oleh perintah ini. Jangan menjalankan seed
pada setiap startup atau redeploy. Tanpa `--pickup-end`, deadline kembali menjadi
delapan jam sejak seed; tanggal eksplisit yang sudah lewat akan ditolak.

### 5. Media dan pemeriksaan setelah deploy

Foto upload memerlukan direktori persisten yang writable; arahkan `MEDIA_ROOT`
ke direktori/volume persisten yang disediakan deployment. Cadangkan file media
bersama database. Dengan `DEBUG=False`, URLconf saat ini **tidak menyajikan
`/media/`**. Konfigurasikan web server/storage untuk menyajikannya dari lokasi
tersebut sebelum memakai upload di produksi. WhiteNoise/`collectstatic` melayani
aset statis, bukan upload pengguna; rewrite Vercel sendiri tidak menyimpan foto.

Periksa katalog melalui `https://<domain-pws>/api/listings` dan
`https://<domain-frontend-vercel>/api/listings`, lalu coba login, logout, perubahan
profil, dan alur pesanan lewat frontend. Pastikan cookie secure tersimpan, mutasi
tidak mendapat CSRF 403, dan foto bisa dibuka setelah restart/redeploy. Jika
katalog kosong, periksa stok, status aktif, dan `pickup_end` pada database PWS;
menjalankan seed pada SQLite lokal tidak mengubah database PWS.

---

## AI Disclosure

AI digunakan sebagai pendamping pengembangan Habisin untuk membaca kode, menyusun
implementasi, membantu debugging, menulis tes dan dokumentasi, serta memberi
saran Git dan deployment. Bagian ini merangkum percakapan pengembangan yang
tersedia dan disclosure tim yang sudah tercatat; bukan klaim bahwa seluruh kode
proyek dibuat oleh AI.

### Tools dan sumber percakapan

| Tool | Penggunaan yang dicatat |
| --- | --- |
| OpenAI Codex | Implementasi dan perbaikan backend/frontend, penyesuaian desain, analisis migrasi, resolusi konflik Git, CI, tes, dan dokumentasi. |
| Claude Code (Anthropic) | Berdasarkan disclosure sebelumnya: pemesanan/mock payment Modul 7 serta tiket dan verifikasi Modul 8, termasuk tes dan dokumentasi. |
| CodeRabbit | Review otomatis pull request sebagai masukan tambahan untuk ditinjau tim; tidak menggantikan review rekan atau hasil CI. |

[Tautan sesi autentikasi yang sebelumnya dicantumkan](https://chatgpt.com/s/cx_6aba210934d88191815c9b8c82fb9223).
Sesi lokal Codex dan Claude Code lainnya tidak disertai tautan publik pada catatan
ini. Nama model atau tautan sesi yang tidak tersedia tidak diasumsikan.
[Riwayat disclosure sebelumnya](docs/ai-disclosure-history.md) mempertahankan
rincian lama, termasuk strategi prompt, keterbatasan, dan catatan implementasi.

### Cakupan bantuan AI

| Area | Bantuan yang diberikan |
| --- | --- |
| Autentikasi dan akun | Registrasi, login/logout berbasis sesi dan CSRF, peran pengguna, edit profil, penggantian password, penghapusan akun, serta konfirmasi password pada registrasi dan perubahan password. |
| Profil dan foto | Upload foto akun/toko pada API, kontrol foto dan avatar, penyesuaian halaman profil terhadap referensi `design.pen`, perbaikan kolom foto yang hilang setelah integrasi branch, serta avatar navbar berbentuk persegi membulat. |
| Navigasi pembeli | Menghilangkan redundansi Beranda/Jelajahi, menyamakan akses profil dari Jelajahi dan Pesanan, serta pemeriksaan header tamu, status loading autentikasi, dan header sticky. |
| Workspace mitra dan kasir | Avatar menuju `/partner/account`, penyesuaian tombol/navigasi Verifikasi kode, peletakan setelah Pesanan dengan gaya navigasi standar, serta penyelarasan halaman kasir Django dengan sidebar workspace. |
| Listing, toko, dan discovery | CRUD listing/toko, pemilihan cabang, upload/crop foto, draf lokal, filter/favorit, discovery berbasis ID toko, peta, lokasi, detail makanan, dan tampilan responsif. |
| Pemesanan dan verifikasi | Reservasi, penahanan/pengembalian stok, batas donasi dan pembatalan, pembayaran simulasi, tiket digital/QR, halaman kasir HTMX, pemindaian QR, serta log verifikasi dan pengurungan (undo) tindakan. |
| Ulasan, komplain, dan statistik | API/UI ulasan dan komplain, pencegahan ulasan ganda, agregasi rating, metrik penjualan mitra, dan widget performa berdasarkan pesanan yang sudah diambil. |
| Integrasi moderasi admin | Diagnosis konflik setelah penggabungan Modul 6, pemisahan `ModerationLog` dan `AdminModerationLog`, perbaikan migrasi lintas branch, pelestarian riwayat/data, fixture mitra approved, dan penghapusan cabang GET inventaris yang menutupi perilaku sebelumnya. Implementasi awal Modul 6 oleh rekan tidak diatribusikan sebagai hasil sesi AI ini. |
| Git | Analisis log, bantuan merge/rebase dan resolusi konflik, pemindahan commit password-confirmation agar berbasis `main`, saran nama branch, serta commit lokal sesuai izin pengguna. |
| CI | Penjelasan workflow/CodeRabbit; pemeriksaan RuntimeWarning, migrasi dan tes PostgreSQL selain SQLite, batas waktu job, laporan coverage/Playwright, penolakan tes flaky dan `test.only`, serta fixture persetujuan mitra melalui API admin dengan sesi terpisah. |
| Seed dan deployment | Opsi `seed_demo --pickup-end`, validasi deadline dan tesnya, panduan Vercel/PWS, environment produksi, PostgreSQL ITF/schema, publikasi subtree backend, migrasi, media persisten, dan langkah pemeriksaan setelah deploy. |
| Dokumentasi | README, dokumentasi modul/integrasi, instruksi pengujian, troubleshooting, batas implementasi, dan penyusunan disclosure ini. |

Nama branch pada percakapan adalah jejak pekerjaan dan dapat berubah setelah
rename/rebase. Riwayat Git dan PR menjadi acuan perubahan yang benar-benar masuk
ke proyek. Saran nama branch atau deployment bukan bukti bahwa tindakan tersebut
sudah dijalankan.

### Cara kerja dan kendali manusia

Pengguna memberikan kebutuhan, batas cakupan, screenshot/referensi desain,
file terkait, log Git, dan pesan error. AI membaca implementasi yang ada lalu
mengusulkan atau mengerjakan perubahan. Pengguna mengoreksi arah pekerjaan,
misalnya mengganti merge menjadi rebase, memilih avatar membulat, menyamakan gaya
Verifikasi kode dengan navigasi lain, dan menentukan batas waktu demo penilaian.

Pada sesi Codex ini, pengguna mengizinkan pembuatan branch dan commit lokal,
tetapi melarang push ke origin. Perubahan yang dikerjakan dikomit lokal;
publikasi dan deployment tidak dilakukan oleh Codex pada sesi ini. Perintah
push dalam panduan deployment adalah instruksi untuk dijalankan pengelola,
bukan catatan tindakan yang telah dilakukan. Pengelola tetap menentukan kode
yang digabung, branch/revisi yang dipublikasikan, kredensial, dan data produksi.

Disclosure Modul 7–8 sebelumnya mencatat penggunaan TDD eksplisit dan review
rekan. Urutan tersebut tidak diklaim berlaku untuk seluruh pekerjaan AI di
proyek. Tes pada perbaikan lain disesuaikan dengan risiko dan perilaku yang diubah.

### Keterbatasan, koreksi, dan tindak lanjut

- **Integrasi branch dan database:** perubahan dari beberapa branch menghasilkan
  model dengan nama sama, tabel yang berbenturan, dan kolom foto yang hilang.
  Bantuan AI mencakup diagnosis, perbaikan migrasi, serta tes upgrade dengan data
  lama. Perbaikan database lokal diuji pada salinan dan didahului backup; hal ini
  tidak berarti database PWS sudah diperbaiki atau dimigrasikan.
- **UI dan desain:** penyesuaian pertama memerlukan koreksi pengguna pada bentuk
  avatar, susunan menu, dan konsistensi navigasi. Screenshot dan browser digunakan
  sebagai acuan; hasil AI tetap memerlukan penilaian visual manusia.
- **Tes dan lingkungan:** fixture lama bergantung pada trusted origin development,
  ID otomatis database, dan mitra yang belum disetujui. Fixture diperjelas dan
  alur approval diuji melalui API admin. Selector browser diperbarui ketika UI
  komplain, moderasi, dan log berubah. Timeout awal pada dev server tidak dianggap
  sebagai bukti fitur benar atau salah tanpa pemeriksaan log dan pengujian ulang.
- **Catatan sesi sebelumnya:** keterbatasan BarcodeDetector, kamera yang belum
  berhenti, hasil refresh terlambat, duplikasi ulasan, perbedaan host tes, encoding,
  serta fixture yang tertinggal dicatat bersama koreksinya pada riwayat disclosure.
- **Batas produk:** pembayaran masih simulasi; statistik tes dapat berisi data
  sintetis, dan angka dampak lingkungan tidak diklaim sebagai hasil nyata tanpa
  asumsi yang disepakati. Referensi desain bukan bukti integrasi layanan produksi.
- **Operasional:** perubahan file atau commit lokal tidak otomatis mengubah PWS
  maupun Vercel. Seed eksplisit menjaga deadline demo sepanjang 20 November 2026
  WIB hanya setelah dijalankan pada database tujuan, dan listing tetap memerlukan
  stok serta status aktif. Upload produksi memerlukan media persisten dan server
  media; dokumentasi saja tidak menyediakan infrastrukturnya.

### Verifikasi dan batas bukti

Pemeriksaan yang digunakan mencakup tes Django, migrasi pada database disposable,
coverage, ESLint, TypeScript, build Next.js, lint workflow, dan tes Playwright.
Tes dengan mock API memeriksa interaksi UI; tes backend/integrasi memeriksa aturan
dan data pada database tes. Keduanya tidak membuktikan isi database produksi.

Hasil yang dilaporkan pada titik pekerjaan terkait dalam percakapan ini:

- Perbaikan konflik model/migrasi awal: **210 tes backend** lulus, dengan backup
  serta pemeriksaan pelestarian data pada database lokal.
- Penguatan CI sebelum rebase berikutnya: **227 tes backend pada masing-masing
  SQLite dan PostgreSQL** lulus, coverage **95%**, build/lint/types dan lint
  workflow lulus, serta **11 tes browser terpilih** lulus. Angka 11 bukan klaim
  seluruh suite E2E telah dijalankan. Setelah rebase, pemeriksaan terarah mencakup
  lint workflow dan approval/pembuatan toko untuk dua mitra memakai sesi admin
  yang dipakai ulang.
- Konfirmasi password: lint, TypeScript, dan **dua tes browser** lulus untuk
  penolakan mismatch sebelum mutasi serta pengiriman konfirmasi yang cocok.
- Deadline seed: **lima tes seed** lulus, meliputi default delapan jam, deadline
  eksplisit, batas tampil katalog, dan penolakan input invalid tanpa perubahan data.
- Dokumentasi deployment diperiksa terhadap konfigurasi repository dan sumber
  resmi terkait; tidak disertai push, deployment, atau seed pada PWS.

Hasil tersebut adalah bukti pada revisi saat diperiksa, bukan jaminan untuk
commit sesudahnya. Hasil CI pada PR terbaru dan review rekan tetap perlu
menjadi dasar sebelum merge atau deployment. Panduan teknis tersedia pada
[Verifikasi Modul 3–4](docs/module-3-4-verification.md),
[Integrasi Modul 3–4](docs/integrate-main-modules-3-4.md),
[Modul 8](docs/module-8.md), [Modul 10](docs/module-10.md), serta bagian verifikasi
dan deployment di README ini.
