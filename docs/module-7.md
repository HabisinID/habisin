# Modul 7 — Alur Pemesanan & Mock Payment

Jalankan `python manage.py migrate` dari `backend/` untuk menerapkan status pesanan
baru. Pesanan lama berstatus `reserved` otomatis menjadi `paid`.

## Alur penggunaan

1. Masuk sebagai **Pembeli**, buka produk, pilih jumlah porsi (1–4), isi catatan
   pengambilan bila perlu, lalu pilih **Lanjut ke ringkasan**. Pesanan dibuat dengan
   status **Menunggu pembayaran** dan stok langsung ditahan.
2. Di **Ringkasan pesanan**, periksa alamat, jarak toko dari lokasi pencarian, jam
   ambil, jumlah porsi, catatan, dan total. Pilih **Ubah pesanan** untuk mengganti
   jumlah porsi atau catatan; stok bertambah/berkurang sesuai selisihnya.
3. Pilih **Simulasikan pembayaran berhasil** (atau **Klaim donasi gratis** untuk
   produk gratis). Status menjadi **Dipesan** dan tiket kode pengambilan tampil.
   Tidak ada transaksi uang sungguhan.
4. Di **Pesanan saya**, pesanan yang belum dibayar dapat dilanjutkan
   (**Lanjutkan pembayaran**), pesanan aktif dapat **dibatalkan** (stok kembali),
   dan pesanan yang sudah dibatalkan atau diambil dapat **dihapus dari riwayat**.

Pembatalan dan penghapusan memakai *optimistic update*: tampilan langsung berubah,
lalu dikembalikan seperti semula disertai pesan error jika server menolak.

## Status pesanan

| Status | Label | Stok ditahan | Aksi yang diizinkan |
| --- | --- | --- | --- |
| `pending` | Menunggu pembayaran | Ya | Ubah, bayar, batal |
| `paid` | Dipesan | Ya | Batal (verifikasi kasir di Modul 8) |
| `picked_up` | Sudah diambil | Tidak | Hapus dari riwayat |
| `cancelled` | Dibatalkan | Tidak | Hapus dari riwayat |

## API

Semua endpoint memerlukan sesi login. Mutasi memerlukan header `X-CSRFToken` dari
`GET /api/auth/csrf`. Pesanan milik akun lain selalu menghasilkan 404.

| Endpoint | Hasil |
| --- | --- |
| `GET /api/reservations` | Riwayat pesanan akun ini, terbaru dahulu. |
| `POST /api/reservations` | Body `{listing_id, quantity, note?}`; khusus Pembeli. 201 dengan status `pending`. |
| `GET /api/reservations/{id}` | Detail pesanan. |
| `PATCH /api/reservations/{id}` | Body `{quantity?, note?}`; hanya saat `pending`. |
| `POST /api/reservations/{id}/pay` | `pending` → `paid`. |
| `POST /api/reservations/{id}/cancel` | `pending`/`paid` → `cancelled`, stok dikembalikan. Aman dipanggil ulang. |
| `DELETE /api/reservations/{id}` | Hanya untuk `cancelled`/`picked_up`; 204. |

Kode status: **400** input tidak valid, stok tidak cukup, atau waktu pengambilan
berakhir; **409** aksi tidak sesuai status pesanan; **429** terlalu banyak perubahan.

## Validasi dan keamanan

- `quantity` harus angka bulat JSON 1–4 (`"2"`, `true`, dan `1.5` ditolak);
  `note` harus teks maksimal 140 karakter. Kode tiket memakai alfabet
  `ACDEFHJKMNPRTUVWXY3479` (tanpa karakter mirip seperti B/8, S/5, O/0) agar mudah diketik kasir.
- Stok dikurangi dengan `UPDATE` bersyarat (`stock >= jumlah`) sehingga pesanan
  bersamaan tidak dapat melebihi stok.
- Decorator `@owned_reservation` mengambil pesanan milik pengguna saat ini dan
  mengunci barisnya (`select_for_update`) selama request.
- Perubahan pesanan dibatasi 30 per menit per akun; membaca pesanan tidak dihitung.
  Pesan 429 ditampilkan dalam Bahasa Indonesia.

## Verifikasi

Dari `backend/` dengan `.venv` aktif:

```bash
python -m pip install -r requirements-dev.txt
coverage run manage.py test
coverage report
```

Dari `frontend/`, dengan backend dan frontend aktif serta katalog `seed_demo` baru:

```bash
npx playwright test tests/orders.spec.ts
```
