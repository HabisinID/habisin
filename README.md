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

## Peran Pengguna
---
### Pembeli
Pengguna umum yang mencari dan memesan makanan surplus dari gerai di sekitarnya. Hak akses & fitur:
- Menjelajah peta sebaran makanan surplus.
- Mencari dan memfilter katalog makanan.
- Memesan makanan surplus dan melakukan mock payment.
- Mengklaim tiket digital dengan kode klaim unik.
- Memberi rating, ulasan, dan laporan komplain.
---
### Mitra
Pemilik atau pengelola gerai makanan yang ingin mendaftarkan dan mengelola tokonya di platform. Hak akses & fitur:
- Mendaftarkan toko (nama, deskripsi, alamat, jam operasional) dengan geocoding lokasi.
- Mengelola listing makanan surplus (tambah, edit, ubah stok, nonaktifkan).
- Menetapkan harga normal, harga diskon, atau donasi gratis.
- Memverifikasi kode klaim 5 digit di sisi kasir.
- Memantau statistik performa penjualan dan porsi terselamatkan.
---
### Admin
Admin platform yang mengatur dan memantau seluruh aktivitas di sistem. Hak akses & fitur:
- Menyetujui atau menolak pendaftaran mitra baru.
- Memoderasi listing publik yang beredar.
- Melakukan take-down konten yang melanggar aturan.
- Mengelola moderation log (CRUD).
- Memantau seluruh aktivitas platform.

## Tim Pengembang
### Kelompok 10 PBP B
| Nama | Tanggung Jawab | NPM |
|------|----------------| --- |
| Rozan Laudzai | Identity & Partner Location | 2506547544
| Christiano Hosea | Surplus Catalog & Map Explorer | 2506615280
| Damica Adreeza Ramadhan | Search & Admin Moderation | 2506625193
| Violin Monica | Booking & Digital Ticket | 2506551794
| Raihan Daffa Aprilianda | Reputation & Impact Dashboard | 2506620021

---

## Menjalankan Demo Lokal

Demo sudah mencakup autentikasi Django + DRF, katalog makanan, Leaflet/OpenStreetMap,
pencarian/filter, favorit lokal, pemesanan dengan simulasi pembayaran, tiket pengambilan,
dan pembatalan pesanan. Antarmuka tersedia dalam Bahasa Indonesia dan responsif.

### Backend

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8000
```

Jika belum memiliki virtual environment, jalankan `python3 -m venv .venv` di folder
`backend` sebelum aktivasi. `.env` bersifat opsional untuk pengembangan lokal;
contoh konfigurasi tersedia di `backend/.env.example`.

`seed_demo` membuat atau memperbarui **enam listing contoh**, mengatur ulang stoknya,
dan membuka waktu pengambilan selama delapan jam sejak perintah dijalankan.
Jalankan ulang saat memulai sesi demo baru, bukan ketika pesanan demo sedang aktif. Perintah menolak pembaruan jika masih ada pesanan aktif.
Nama toko, produk, dan koordinat adalah ilustrasi, bukan inventaris atau kemitraan nyata.
Tidak ada akun dengan password bawaan. Buat akun dari tombol **Daftar gratis**.

### Frontend (terminal terpisah)

```bash
cd frontend
npm ci
npm run dev
```

Buka **http://localhost:3000**. Next.js meneruskan `/api/*` ke Django di
`http://127.0.0.1:8000`, sehingga browser menggunakan satu origin. Untuk backend
berbeda, isi `BACKEND_URL` di `frontend/.env.local` dan restart Next.js.
Foto ilustrasi berasal dari Unsplash; foto dan tile OpenStreetMap membutuhkan internet.
Jika backend tidak tersedia, katalog pratinjau tetap tampil dengan pesan yang jelas;
autentikasi dan pemesanan membutuhkan backend aktif.

### Alur demo

1. Daftar sebagai **Pembeli**. Ketersediaan username diperiksa otomatis.
2. Cari/filter makanan, simpan favorit, atau pilih marker harga di tampilan **Peta**.
   Tombol lokasi meminta izin GPS dan menghitung ulang jarak dari lokasi pengguna.
3. Buka produk, pilih jumlah porsi, lalu pilih **Simulasikan pembayaran berhasil**.
   Tidak ada pembayaran sungguhan; stok berkurang dan kode tiket tersimpan di SQLite.
4. Buka **Pesanan saya** untuk melihat tiket atau membatalkan pesanan. Pembatalan
   mengembalikan stok dan tidak bisa menggandakan pengembalian stok.
5. Klik nama akun untuk mengubah profil/password atau menghapus akun dengan
   konfirmasi password. Penghapusan akun membatalkan pesanan dan mengembalikan stok.

Akun **Mitra** dapat mendaftar dan membuka ringkasan demo khusus mitra.
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

### Cakupan autentikasi

- Registrasi pembeli/mitra, login, logout, sesi persisten tujuh hari.
- Cookie sesi `HttpOnly` dan `SameSite=Lax`; semua mutasi API, termasuk login dan
  registrasi, memerlukan CSRF token. Token sesi tidak disimpan di `localStorage`.
- Password di-hash oleh Django dan divalidasi dengan validator bawaan Django.
- Username unik tanpa membedakan huruf besar/kecil untuk registrasi aplikasi.
- Perubahan password mempertahankan sesi saat ini dan mencabut sesi lainnya.
- Server membatasi akses berdasarkan peran dan kepemilikan pesanan.
- Pembatasan percobaan login/registrasi anonim: 30 permintaan per menit per IP
  melalui cache lokal DRF (konfigurasi cache bersama diperlukan untuk multi-worker).

Ini fondasi demo, belum implementasi lengkap seluruh 10 modul. Onboarding/geocoding
mitra, CRUD produk di frontend, persetujuan mitra/moderasi, verifikasi kasir/QR,
ulasan/komplain, statistik dampak aktual, dan PWA offline belum diimplementasikan.
Kalkulator dampak memakai asumsi ilustratif; pemesanan demo tidak dihitung sebagai
makanan yang benar-benar terselamatkan. Semua listing saat ini merupakan data demo.

### Verifikasi

```bash
cd backend
source .venv/bin/activate
python manage.py test
python manage.py check
```

```bash
cd frontend
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Tes browser membutuhkan backend dan frontend aktif di `127.0.0.1:8000` dan
`127.0.0.1:3000`, serta katalog `seed_demo` yang belum kedaluwarsa. Tes membuat akun
sementara, menguji alur reservasi, lalu menghapus akun tersebut. Screenshot pemeriksaan
tersimpan di `/tmp/habisin-desktop.png` dan `/tmp/habisin-mobile.png`.

Untuk deployment, tetapkan `DEBUG=False`, `SECRET_KEY` acak yang kuat,
`ALLOWED_HOSTS`, dan `CSRF_TRUSTED_ORIGINS` sesuai domain HTTPS. Cookie secure otomatis
aktif ketika debug mati. Jalankan `python manage.py collectstatic --noinput` untuk
aset Django admin. Konfigurasi produksi lebih lanjut diperlukan sebelum menerima
pengguna atau transaksi sungguhan.

## AI Disclosure

Implemented and running at

Authentication: registration, login/logout, roles, persistent sessions, profile editing, password changes, and account deletion.

Responsive demo: food catalog, search/filtering, interactive map, favorites, mock payments, reservations, pickup tickets, and cancellation.

Setup instructions and demo limitations added to [README.md](/home/nekomputer/myroom/programming/projects/habisin/README.md)
