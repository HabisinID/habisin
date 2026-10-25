# Modul 2 — Onboarding Mitra dan Geocoding Lokasi Toko

Jalankan `python manage.py migrate` dari `backend/` untuk menerapkan tabel toko dan
geocoding. Tidak diperlukan API key tambahan. Setelah masuk atau mendaftar sebagai
**Mitra**, aplikasi mengarahkan pengguna ke `/partner/store`. Tautan **Toko** di
header membuka halaman ini; Dasbor mitra membuka pengelolaan listing Modul 3.

## Alur penggunaan

1. Pilih **Daftarkan toko**, lalu isi nama, deskripsi, alamat usaha publik, serta
   jam buka/tutup harian dalam WIB. Satu akun mitra dapat mengelola beberapa toko.
   Setelah toko pertama, gunakan **Tambah toko** dan pilih kartu cabang untuk mengelolanya. Jam tutup
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

Jika DNS atau koneksi sementara gagal, backend mencoba ulang sekali dengan jeda
minimal 1,1 detik sambil tetap memegang kuota bersama. Penolakan HTTP (termasuk
403/429), sertifikat tidak valid, dan hasil yang rusak tidak dicoba ulang otomatis.
Gangguan yang menetap tetap menghasilkan 503 dengan pesan sesuai penyebabnya.

Log backend menyertakan kategori `dns`, `timeout`, `tls`, `connection`,
`http_error`, `rate_limited`, atau `invalid_response`, beserta status HTTP jika tersedia. Alamat
toko, token, dan parameter URL penyedia tidak dicatat. Untuk `dns`, periksa DNS
dan koneksi internet mesin yang menjalankan Django; untuk `tls`, periksa trust
store/sertifikat jaringan; untuk HTTP 403/429, periksa identitas aplikasi, kuota,
dan kebijakan penyedia. Error jaringan permanen perlu diperbaiki pada server.

Untuk memeriksa DNS dari environment backend:

```bash
python -c "import socket; print(socket.getaddrinfo('nominatim.openstreetmap.org', 443))"
```

Pada WSL, jika resolusi DNS gagal secara berselang-seling, simpan pekerjaan lalu
jalankan `wsl --shutdown` dari **Windows PowerShell**, buka kembali WSL, dan
jalankan ulang backend/frontend. Perintah ini menghentikan semua distribusi WSL
yang sedang berjalan. Jika masalah tetap muncul, periksa DNS/VPN di Windows;
lihat [panduan troubleshooting WSL Microsoft](https://learn.microsoft.com/windows/wsl/troubleshooting)
dan [penjelasan DNS tunneling](https://learn.microsoft.com/windows/wsl/networking#dns-tunneling).

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
| `GET /api/partner/stores` | Inventaris seluruh toko sendiri: `{stores: [...]}`, termasuk yang ditutup. |
| `POST /api/partner/stores` | Buat toko/cabang tambahan (201), tetap dengan geocoding dan konfirmasi pin. |
| `GET/PATCH/DELETE /api/partner/stores/{id}` | Detail, edit/status, atau hapus cabang tertentu; toko asing menghasilkan 404. DELETE tetap memerlukan `{confirmation_name}`. |
| `/api/partner/store` (adapter lama) | Nol/satu toko mempertahankan bentuk respons dan mutasi lama; POST hanya membuat toko pertama. Jika akun memiliki beberapa toko, semua metode menghasilkan 409 `store_selection_required`; gunakan endpoint plural/ID. |
| `GET /api/stores/{id}` | Publik, termasuk toko ditutup sementara; toko yang dihapus menghasilkan 404. |

Field pembuatan: `name`, `description`, `address`, `opening_time`, `closing_time`,
`latitude`, `longitude`, `geocode_token`, dan `location_confirmed: true`.
Jam memakai format `HH:MM` atau `HH:MM:SS`. Perubahan alamat pada PATCH membutuhkan
kedua koordinat, token baru yang cocok, dan konfirmasi pin. Perubahan koordinat saja
memerlukan konfirmasi. `owner` tidak dapat diubah atau dibaca melalui API publik.

Listing Modul 3 memilih ID toko. Nama/alamat/pin listing berasal dari toko tersebut.
Perubahan nama atau lokasi cabang ditolak dengan 409 selama ada reservasi aktif;
setelah tidak ada reservasi aktif, perubahan menyelaraskan listing cabang dalam satu
transaksi. Menutup toko menghentikan penawaran baru tetapi menjaga pesanan lama.
Toko yang masih dirujuk listing tidak dapat dihapus (409); tutup sementara sebagai
alternatif. Penghapusan akun menonaktifkan listing dan melepas relasi toko sambil
mempertahankan lokasi serta riwayat pengambilan pembeli, lalu menghapus toko akun.
Data demo/legacy tanpa relasi toko tetap memakai snapshot lamanya; tidak ditautkan
berdasarkan tebakan nama.

## Verifikasi

Dari `backend/`, jalankan `.venv/bin/python manage.py test`. Tes memakai database
terpisah dan mock HTTP geocoder untuk menguji CRUD, role/kepemilikan, CSRF, koordinat,
token kedaluwarsa/alamat berubah, cache, rate limit, dan kegagalan penyedia.

Dari `frontend/`, dengan server Next.js aktif, jalankan:

```bash
npx playwright test tests/stores.spec.ts
```

Tes browser toko memakai mock API plural dan tidak memerlukan Nominatim/backend aktif.
Tes mencakup CRUD, konfirmasi pin, geocoding ulang, profil publik, izin peran,
jam lintas hari, kegagalan geocoder, input koordinat, dua cabang yang tidak saling
memengaruhi, dan tampilan mobile.
