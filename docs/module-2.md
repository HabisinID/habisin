# Modul 2 — Onboarding Mitra dan Geocoding Lokasi Toko

Jalankan `python manage.py migrate` dari `backend/` untuk menerapkan tabel toko dan
geocoding. Tidak diperlukan API key tambahan. Setelah masuk atau mendaftar sebagai
**Mitra**, aplikasi mengarahkan pengguna ke `/partner/store`. Tautan **Toko** di
header dan tombol mitra di halaman utama juga membuka halaman ini.

## Alur penggunaan

1. Pilih **Daftarkan toko**, lalu isi nama, deskripsi, alamat usaha publik, serta
   jam buka/tutup harian dalam WIB. Satu akun mitra mengelola satu toko. Jam tutup
   yang lebih awal dari jam buka berarti tutup pada hari berikutnya.
2. Pilih **Cari alamat di peta**, lalu pilih hasil Nominatim yang sesuai. Geser pin,
   klik peta, atau sesuaikan kolom latitude/longitude. Centang konfirmasi posisi
   sebelum menyimpan. Peta memakai tile dan atribusi OpenStreetMap.
3. Buka **Lihat profil publik** untuk membagikan `/stores/{id}`. Profil menampilkan
   deskripsi, alamat, jam operasional, status, dan pin lokasi tanpa data akun pemilik.
4. Pilih **Edit toko** untuk memperbarui data. Perubahan alamat menghapus pin lama
   dari form dan mewajibkan pencarian serta konfirmasi ulang. Mengubah detail lain
   tidak membutuhkan permintaan geocoding baru.
5. **Tutup toko sementara** mempertahankan profil dengan status ditutup dan dapat
   dibatalkan lewat **Aktifkan kembali toko**. **Hapus toko** memerlukan pengetikan
   nama toko persis; profil/pin dihapus permanen, akun mitra tetap tersedia.

## Nominatim

Pencarian hanya dikirim setelah tombol ditekan, bukan autocomplete. Sesuai
[usage policy](https://operations.osmfoundation.org/policies/nominatim/), backend
mengidentifikasi aplikasi melalui User-Agent, menyimpan hasil dalam cache database
selama tujuh hari, dan memakai satu baris kuota database bersama agar semua worker
memberi jeda minimal satu detik antarpermintaan. Pencarian yang terlalu cepat menerima
HTTP 429 dan dapat dicoba ulang; batas tambahan per akun adalah 10/menit. Jangan
mengirim data pribadi/rahasia melalui kolom alamat.

`NOMINATIM_URL` mengatur URL endpoint search dan dapat diganti ke penyedia yang
kompatibel tanpa perubahan kode. `NOMINATIM_USER_AGENT` mengatur identitas aplikasi;
tambahkan URL/kontak pengelola saat deployment. Default tercantum dalam
[`backend/.env.example`](../backend/.env.example). Untuk trafik lebih besar,
gunakan penyedia geocoding yang sesuai atau instance Nominatim sendiri.

Hasil pencarian menghasilkan token bertanda tangan yang terikat pada alamat dan
akun, berlaku 30 menit. API menolak penyimpanan alamat baru tanpa token yang sesuai
serta pin terkonfirmasi. Jika token kedaluwarsa, cari alamat lagi. Cache yang masih
berlaku tidak memerlukan permintaan baru ke penyedia.

## API

Semua mutasi memakai sesi Django dan header `X-CSRFToken`, diperoleh dari
`GET /api/auth/csrf`. Endpoint pengelolaan hanya untuk role **Mitra**; data yang
diakses selalu milik akun saat ini, tanpa menerima ID pemilik dari browser.

| Endpoint | Hasil |
| --- | --- |
| `POST /api/partner/geocode` | Body `{address}`; mengembalikan `{results, geocode_token}`. Hasil kosong berarti alamat perlu diperjelas; gangguan penyedia menghasilkan 503. |
| `GET /api/partner/store` | Mengembalikan `{store: {...}}` atau `{store: null}`. |
| `POST /api/partner/store` | Buat toko (201); satu akun satu toko, duplikat ditolak dengan 409. |
| `PATCH /api/partner/store` | Edit detail/lokasi; `is_open: false/true` menutup/mengaktifkan toko. |
| `DELETE /api/partner/store` | Body `{confirmation_name}`; nama harus sesuai, sukses menghasilkan 204. |
| `GET /api/stores/{id}` | Publik, termasuk toko ditutup sementara; toko yang dihapus menghasilkan 404. |

Field pembuatan: `name`, `description`, `address`, `opening_time`, `closing_time`,
`latitude`, `longitude`, `geocode_token`, dan `location_confirmed: true`.
Jam memakai format `HH:MM` atau `HH:MM:SS`. Perubahan alamat pada PATCH membutuhkan
kedua koordinat, token baru yang cocok, dan konfirmasi pin. Perubahan koordinat saja
memerlukan konfirmasi. `owner` tidak dapat diubah atau dibaca melalui API publik.

Toko merupakan entitas mandiri. Listing contoh masih menyimpan nama/alamat sendiri;
penautan listing ke toko dan pengelolaan produk termasuk Modul 3, sehingga perubahan
atau penutupan toko belum mengubah katalog contoh. Penghapusan akun menghapus tokonya.

## Verifikasi

Dari `backend/`, jalankan `.venv/bin/python manage.py test`. Tes memakai database
terpisah dan mock HTTP geocoder untuk menguji CRUD, role/kepemilikan, CSRF, koordinat,
token kedaluwarsa/alamat berubah, cache, rate limit, dan kegagalan penyedia.

Dari `frontend/`, dengan server Next.js aktif, jalankan:

```bash
npx playwright test tests/stores.spec.ts
```

Tes browser toko memakai mock API dan tidak memerlukan Nominatim/backend aktif.
Tes mencakup CRUD, konfirmasi pin, geocoding ulang, profil publik, izin peran,
jam lintas hari, kegagalan geocoder, input koordinat, dan tampilan mobile.
