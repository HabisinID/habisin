# HABISIN

> **Save Food, Cut Waste, Feed Communities.**

Web app berbasis peta interaktif (map-first progressive web app) yang mempertemukan gerai makanan berlebih dengan masyarakat sekitar. Melalui transparansi geolokasi dan reservasi instan, HABISIN memfasilitasi penebusan makanan surplus dengan diskon signifikan maupun klaim donasi gratis sebelum batas waktu operasional berakhir.

**Kategori:** Web App Berbasis Peta Interaktif (Map-First PWA)
**Domain Masalah:** Food Waste Management, Environmental Sustainability

---

## Latar Belakang

Indonesia menghadapi tantangan besar terkait *food loss and waste* (FLW). Berdasarkan laporan Bappenas, timbulan sampah makanan di Indonesia mencapai **23–48 juta ton per tahun**, dengan sektor konsumsi (restoran, kafe, katering, gerai ritel modern) sebagai salah satu kontributor terbesar di area perkotaan.

Penumpukan makanan layak santap di Tempat Pembuangan Akhir (TPA) membuang sumber daya sekaligus memperburuk krisis iklim melalui pelepasan gas metana (CH₄). Berdasarkan data [Kementerian Lingkungan Hidup 2025](https://sampahnasional.kemenlh.go.id/portal-indikatif/data/komposisi-sampah), komposisi sampah di Indonesia didominasi sisa makanan sebesar **40,16%**.

HABISIN hadir untuk menekan kerugian pelaku usaha, meringankan pengeluaran masyarakat, dan mentransformasikan penanganan food waste menjadi aksi mitigasi emisi gas rumah kaca yang terukur.

---

## Peran Pengguna

| Role | Deskripsi |
|------|-----------|
| **Pembeli** | Menjelajah peta, mencari & memesan makanan surplus, klaim tiket digital, memberi rating. |
| **Mitra** | Mendaftarkan toko, mengelola listing makanan surplus, memverifikasi kode klaim kasir. |
| **Admin** | Menyetujui/menolak mitra baru, memoderasi listing publik, take-down konten melanggar. |

---

## Public API / Mock API

| Komponen | Penyedia / Teknologi | Endpoint Kunci / Metode | Kegunaan |
|----------|----------------------|--------------------------|----------|
| Peta Interaktif | Leaflet.js + OpenStreetMap | `L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png')` | Menampilkan peta & merender marker toko tanpa batasan kuota. |
| Geocoding Alamat | Nominatim API (OSM) | `GET https://nominatim.openstreetmap.org/search?q={alamat}&format=json` | Mengubah teks alamat toko menjadi koordinat (lat, lng) saat onboarding. |
| Deteksi Lokasi Klien | HTML5 Geolocation API | `navigator.geolocation.getCurrentPosition()` | Mendeteksi posisi pengguna untuk perhitungan radius terdekat. |
| Penyimpanan Gambar | Cloudinary API / Supabase Storage | `POST https://api.cloudinary.com/v1_1/{cloud_name}/image/upload` | Menyimpan gambar makanan surplus & avatar pengguna. |
| Generator QR Code | qrcode.react / qrcode (NPM) | Client-side library (tanpa external API) | Menghasilkan QR tiket klaim di peramban pembeli. |
| Pembayaran | Mock Payment (simulasi) | Client-side | Simulasi transaksi berhasil untuk mengubah status pesanan. |

---

## Daftar Modul & Pembagian Tugas

Aplikasi dibagi menjadi **10 modul mandiri (zero-dependency)** untuk 5 anggota.

### Rozan Laudzai — Identity & Partner Location

- **Modul 1 — Autentikasi & Manajemen Pengguna (Role-Based)**
  Registrasi, login, logout, dan penyimpanan token sesi untuk 3 role (Pembeli, Mitra, Admin). Cek ketersediaan username secara real-time (AJAX). Halaman profil pengguna dan form ganti password sederhana, termasuk fitur **Delete akun**.
- **Modul 2 — Onboarding Mitra & Geocoding Lokasi Toko**
  Form pendaftaran toko (nama, deskripsi, alamat teks, jam operasional). Integrasi Nominatim API untuk mengubah alamat teks menjadi koordinat (lat, lng) yang tersimpan di database. Antarmuka peta mini (Leaflet) agar mitra dapat mengonfirmasi posisi pin tokonya.

### Christiano Hosea — Surplus Catalog & Map Explorer

- **Modul 3 — Manajemen Produk Makanan Surplus (CRUD Mitra)**
  Form pembuatan listing makanan (nama, foto, deskripsi, harga normal, harga diskon/gratis, jumlah stok porsi, batas waktu pengambilan). Tabel manajemen produk di sisi mitra (edit data, ubah stok manual, tombol nonaktifkan listing).
- **Modul 4 — Peta Sebaran Makanan Interaktif (Leaflet)**
  Halaman peta utama yang memplot marker lokasi toko berdasarkan data koordinat (lat, lng). Deteksi koordinat pengguna via browser GPS (`navigator.geolocation`). Popup ringkas saat marker diklik: nama toko, jarak relatif, dan tombol langsung ke halaman toko (AJAX).

### Damica Adreeza Ramadhan — Search & Admin Moderation

- **Modul 5 — Pencarian Katalog & Filter Makanan**
  Kolom pencarian teks nama makanan/toko (AJAX). Komponen filter: pilihan kategori makanan, rentang harga, dan filter biner ("Hanya Tampilkan Donasi Gratis"). Tampilan daftar kartu produk (product card list) responsif dengan indikator harga diskon.
- **Modul 6 — Panel Kontrol & Moderasi Admin**
  Halaman tabel admin untuk melihat daftar mitra baru dan tombol persetujuan (Approve/Reject). Tabel daftar listing publik dengan tombol darurat Take-Down jika isi listing melanggar aturan. **Moderation Log (CRUD)**.

### Violin Monica — Booking & Digital Ticket

- **Modul 7 — Alur Pemesanan & Mock Payment**
  Halaman ringkasan pemesanan (input jumlah porsi, catatan pengambilan, menampilkan jarak toko dengan lokasi buyer). Halaman simulasi pembayaran (mock payment screen) dengan tombol instan "Simulasikan Pembayaran Berhasil" yang langsung mengubah status transaksi menjadi lunas/terpesan. Termasuk fitur batal pesanan.
- **Modul 8 — Tiket Digital & Verifikasi Kode Kasir**
  Halaman tiket digital pembeli yang menampilkan ringkasan pesanan, batas jam ambil, dan kode klaim unik 5 digit acak (misal: H7B29). Halaman verifikasi kasir di sisi mitra untuk memasukkan kode 5 digit, memvalidasi kecocokannya, dan mengubah status pesanan menjadi selesai diambil (AJAX).

### Raihan Daffa Aprilianda — Reputation & Impact Dashboard

- **Modul 9 — Rating Toko & Sistem Komplain (Ulasan)**
  Form pengisian rating bintang (1–5) dan ulasan teks untuk pembeli yang sudah menyelesaikan pengambilan (AJAX). Komponen tampilan rata-rata rating pada profil toko dan form laporan komplain sederhana jika makanan tidak higienis. Termasuk fitur edit ulasan dan hapus ulasan.
- **Modul 10 — Dasbor Statistik & Kalkulator Dampak Lingkungan**
  Halaman metrik dampak lingkungan publik: akumulasi total porsi makanan terselamatkan, total kilogram sampah terhindarkan (W), dan estimasi penurunan gas rumah kaca (W × 2,5 kg CO₂e). Widget statistik performa penjualan di dasbor mitra (total porsi terselamatkan dan total rupiah terhimpun).

---

## Tim Pengembang

| Nama | Tanggung Jawab |
|------|----------------|
| Rozan Laudzai | Identity & Partner Location |
| Christiano Hosea | Surplus Catalog & Map Explorer |
| Damica Adreeza Ramadhan | Search & Admin Moderation |
| Violin Monica | Booking & Digital Ticket |
| Raihan Daffa Aprilianda | Reputation & Impact Dashboard |