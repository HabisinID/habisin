# Modul 10 — Statistik Performa Penjualan Mitra

Dokumen ini menjelaskan widget performa penjualan di **Mitra → Dasbor** (`/partner`).
Widget membaca data pesanan milik mitra yang sedang masuk. Kalkulator dampak lingkungan
publik belum termasuk dalam implementasi Modul 10 ini.

## Alur penggunaan

1. Mitra yang sudah disetujui admin membuka `/partner`. Widget **Performa penjualan**
   tampil di atas daftar pesanan.
2. Pilih rentang **Hari ini**, **7 hari**, **30 hari**, atau **Tahun**. Pilihan mengubah
   jumlah porsi berbayar yang sudah diambil, nilai transaksi simulasi, dan porsi gratis
   yang sudah diambil.
3. Grafik **Porsi terjual · 7 hari terakhir** selalu menunjukkan tujuh tanggal WIB
   terakhir dan tidak berubah mengikuti filter metrik. Grafik hanya menghitung porsi
   pesanan berbayar yang sudah diambil.
4. Widget diperbarui saat periode berubah, tab browser kembali mendapat fokus, dan
   setiap 30 detik. Gagal memuat data menampilkan pesan dan tombol **Coba lagi**.

## Definisi metrik dan batas perhitungan

Semua metrik pada objek `sales` dihitung untuk listing milik mitra saat ini dan
menggunakan tanggal lokal **Asia/Jakarta (WIB)**.

| Metrik | Definisi |
| --- | --- |
| `sold_portions` | Jumlah `quantity` pada pesanan `picked_up` dengan `total > 0`, berdasarkan waktu pengambilan dalam rentang terpilih. |
| `simulated_total` | Jumlah `total` pesanan yang sama. Pembayaran di aplikasi masih simulasi, jadi nilai ini bukan pencairan atau pendapatan uang sungguhan. |
| `free_portions` | Jumlah `quantity` pada pesanan `picked_up` dengan `total = 0`, berdasarkan waktu pengambilan dalam rentang terpilih. |
| `picked_up_series` | Tujuh nilai harian untuk porsi berbayar (`total > 0`) berstatus `picked_up`, dikelompokkan menurut `picked_up_at` dalam WIB. Hari tanpa pengambilan bernilai nol. |

Pesanan `pending`, `paid` yang belum diambil, `cancelled`, dan `expired` tidak dihitung
sebagai porsi terselamatkan pada widget ini. Donasi gratis ditampilkan terpisah dari
porsi berbayar. Metrik `sold_portions` menghitung porsi, bukan jumlah transaksi.

Rentang untuk filter adalah tanggal kalender WIB: **Hari ini** satu hari berjalan,
**7 hari** hari ini dan enam hari sebelumnya, **30 hari** hari ini dan 29 hari
sebelumnya, serta **Tahun** hari ini dan 364 hari sebelumnya. Grafik tetap memakai
tujuh hari terakhir untuk semua pilihan filter.

Endpoint juga mengembalikan `booked_portions`, `simulated_total`, dan `series` di tingkat
atas respons untuk ringkasan pesanan berbasis waktu pembuatan. Angka tersebut berbeda
dari `sales.*` dan bukan bukti makanan sudah diambil. Widget performa menggunakan objek
`sales`.

## Kontrak API

`GET /api/partner/dashboard?period=today|week|month|year` memerlukan sesi mitra yang
sudah disetujui. Data dibatasi ke listing milik akun itu. Respons menyediakan objek
`sales` berikut:

```json
{
  "sales": {
    "sold_portions": 5,
    "simulated_total": 38000,
    "free_portions": 2,
    "picked_up_series": [
      { "day": "2026-10-24", "portions": 0 },
      { "day": "2026-10-25", "portions": 1 },
      { "day": "2026-10-26", "portions": 0 },
      { "day": "2026-10-27", "portions": 0 },
      { "day": "2026-10-28", "portions": 2 },
      { "day": "2026-10-29", "portions": 0 },
      { "day": "2026-10-30", "portions": 2 }
    ]
  }
}
```

Contoh di atas hanya menjelaskan bentuk respons, bukan data aktual. Respons sebenarnya
selalu memiliki tujuh entri `picked_up_series`. Periode selain pilihan yang didukung
menghasilkan `400`; akun bukan mitra atau mitra yang belum disetujui tidak dapat membaca
endpoint ini.

## Verifikasi

Dari `backend/` dengan virtual environment aktif, jalankan tes agregasi statistik,
pemisahan donasi gratis, rentang WIB, dan kepemilikan mitra:

```bash
python manage.py test main.test_statistics_dashboard
```

Dengan Next.js berjalan di `localhost:3000`, jalankan tes UI yang memakai fixture API
tiruan:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e -- tests/partner-statistics.spec.ts
```

Fixture Playwright berisi angka sintetis untuk memastikan tampilan metrik dan tujuh
batang grafik. Nilainya bukan catatan penjualan nyata. Tes backend memvalidasi agregasi
dari database tes yang terisolasi.
