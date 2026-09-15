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

Aplikasi dibagi menjadi **10 modul** untuk 5 anggota.

### Identity & Partner Location
- **Modul 1 — Autentikasi & Manajemen Pengguna (Role-Based)**
  Registrasi, login, logout, penyimpanan token sesi untuk 3 role. Halaman profil & form ganti password.
- **Modul 2 — Onboarding Mitra & Geocoding Lokasi Toko**
  Form pendaftaran toko + integrasi Nominatim (alamat → koordinat) + peta mini Leaflet untuk konfirmasi pin.

### Surplus Catalog & Map Explorer
- **Modul 3 — Manajemen Produk Makanan Surplus (CRUD Mitra)**
  Form listing makanan (nama, foto, harga normal/diskon, stok, batas waktu) + tabel manajemen produk.
- **Modul 4 — Peta Sebaran Makanan Interaktif (Leaflet)**
  Peta utama plot marker toko, deteksi GPS pengguna, popup ringkas (nama, jarak, tombol ke toko).

### Search & Admin Moderation
- **Modul 5 — Pencarian Katalog & Filter Makanan**
  Pencarian teks, filter kategori/harga/donasi gratis, daftar kartu produk responsif.
- **Modul 6 — Panel Kontrol & Moderasi Admin**
  Tabel approve/reject mitra baru + tabel listing publik dengan tombol take-down.

### Booking & Digital Ticket
- **Modul 7 — Alur Pemesanan & Mock Payment**
  Ringkasan pemesanan + layar simulasi pembayaran ("Simulasikan Pembayaran Berhasil").
- **Modul 8 — Tiket Digital & Verifikasi Kode Kasir**
  Tiket digital dengan kode klaim 5 digit acak + halaman verifikasi kasir sisi mitra.

### Reputation & Impact Dashboard
- **Modul 9 — Rating Toko & Sistem Komplain (Ulasan)**
  Form rating bintang 1–5 & ulasan teks + rata-rata rating di profil toko + form komplain.
- **Modul 10 — Dasbor Statistik & Kalkulator Dampak Lingkungan**
  Metrik publik (porsi terselamatkan, kg sampah terhindarkan W, estimasi CO₂e = W × 2,5 kg) + widget performa mitra.

---

## Tim Pengembang

| Nama | Tanggung Jawab |
|------|----------------|
| Rozan Laudzai | Identity & Partner Location |
| Christiano Hosea | Surplus Catalog & Map Explorer |
| Damica Adreeza Ramadhan | Search & Admin Moderation  |
| Violin Monica | Booking & Digital Ticket  |
| Raihan Daffa Aprilianda | Reputation & Impact Dashboard |