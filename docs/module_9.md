# Modul 9 — Ulasan Produk & Laporan Komplain

Modul ini memungkinkan pembeli memberi ulasan untuk produk yang sudah diambil dan
melaporkan masalah pada pesanan. Rating toko dihitung dari seluruh ulasan produk yang
terhubung ke toko tersebut. Pembeli dapat mengelola ulasannya dari **Akun → Ulasan saya**
dan memantau status komplain dari halaman yang sama. Laporan masuk ke antrean admin
untuk ditinjau, diselesaikan, atau ditindaklanjuti dengan penurunan listing.

Jalankan `python manage.py migrate` dari `backend/` setelah memperbarui kode untuk
menerapkan migrasi ulasan dan komplain. Migrasi fitur ini mencakup `0013_complaint_review`
dan `0014_review_product_and_complaint_reason`; jalur migrasi berikutnya digabungkan oleh
migrasi merge. Gunakan seluruh graph migrasi aplikasi, jangan memilih atau menghapus
migrasi secara manual.

## Alur penggunaan

1. **Beri ulasan dari riwayat pesanan.** Pada **Pesanan saya → Riwayat**, tombol ulasan
   hanya muncul untuk pesanan berstatus **Sudah diambil**. Tombol laporan komplain tersedia
   untuk pesanan yang masih dibayar atau sudah diambil selama belum ada laporan untuk
   pesanan itu.
2. **Halaman ulasan produk** (`/ulasan/{listingId}`) memuat ringkasan produk dan status
   kelayakan dari server. Pembeli memilih rating 1–5, menulis komentar opsional, lalu
   mengirim ulasan. Jika ulasan untuk produk itu sudah ada, halaman berubah menjadi form
   edit; pembeli dapat menyimpan perubahan atau menghapus ulasan dengan konfirmasi.
3. **Satu ulasan berlaku untuk satu produk per pembeli.** Pesanan lain untuk produk yang
   sama tidak membuka ulasan baru. Pembeli tetap dapat mengubah ulasan yang sudah ada.
4. **Laporan komplain** (`/komplain/{reservationId}`) menampilkan ringkasan pesanan dan
   form kategori masalah: kebersihan, makanan basi/tidak segar, makanan tidak sesuai
   pesanan, atau masalah lainnya. Setelah laporan terkirim, halaman menampilkan konfirmasi.
   Satu pesanan hanya dapat memiliki satu laporan.
5. **Penanganan admin.** Admin membuka **Admin → Laporan komplain**, memilih laporan,
   lalu menandainya **Sedang ditinjau** atau **Selesai**. Jika laporan menunjukkan listing
   berisiko, admin dapat menurunkan listing dengan alasan wajib; tindakan itu juga
   menyelesaikan laporan. Komplain selesai tidak dapat dibuka kembali.
6. **Ulasan di profil toko dan produk.** Profil toko menampilkan rata-rata, jumlah ulasan,
   sebaran rating 1–5, tanggal, dan ulasan lintas produk. Profil produk menampilkan ulasan
   untuk produk tersebut. Daftar mulai menampilkan 4 ulasan; **Lihat ulasan lainnya**
   menambahkan ulasan berikutnya. Urutan dapat diubah ke **Terbaru**, **Rating tertinggi**,
   atau **Rating terendah**.
7. **Akun → Ulasan saya** menampilkan ulasan milik pembeli, termasuk tanggal, rating,
   produk dan toko. Pembeli dapat mengedit atau menghapus ulasan di bagian ini. Bagian
   **Komplain saya** menampilkan laporan dan statusnya: `open` sebagai **Menunggu
   ditinjau**, `reviewed` sebagai **Sedang ditinjau**, dan `resolved` sebagai **Selesai
   ditangani**.

## Kontrak API

Endpoint tersedia melalui proxy frontend `/api`. Endpoint privat menggunakan sesi cookie
dan mutasi memerlukan header `X-CSRFToken` dari `GET /api/auth/csrf`.

| Method | Path | Akses dan hasil |
| --- | --- | --- |
| `GET` | `/api/listings/{listingId}/review-eligibility` | Pembeli masuk. Mengembalikan `listing`, `can_review`, `reservation_id`, dan `review` yang sudah ada (jika ada). |
| `GET` | `/api/reservations/{reservationId}/feedback` | Pembeli pemilik pesanan. Mengembalikan `can_review`, `review`, `can_complain`, dan `complaint`. |
| `POST` | `/api/reviews` | Pembeli. Body `{reservation_id, rating, comment}`; membuat ulasan dan mengembalikan `201`. |
| `PATCH` | `/api/reviews/{reviewId}` | Pemilik ulasan. Body parsial `{rating?, comment?}`; mengembalikan ulasan yang diperbarui. `reservation_id` tidak dapat diubah. |
| `DELETE` | `/api/reviews/{reviewId}` | Pemilik ulasan. Menghapus ulasan dan mengembalikan `204`. |
| `GET` | `/api/stores/{storeId}/reviews` | Publik. Mengembalikan `{store_id, average_rating, review_count, reviews}` untuk seluruh produk toko. Jika belum ada ulasan, `average_rating` bernilai `null`. |
| `POST` | `/api/complaints` | Pembeli pemilik pesanan. Body `{reservation_id, reason, description}`; membuat laporan dan mengembalikan `201`. |
| `GET` | `/api/reviews/mine` | Pembeli masuk. Mengembalikan `{reviews, complaints}` milik akun aktif. |
| `GET` | `/api/admin/complaints?status=open|reviewed|resolved|all` | Admin. Mengembalikan antrean terfilter, jumlah per status, dan detail pesanan/listing. Mendukung `q`, `page`, dan `page_size`. |
| `PATCH` | `/api/admin/complaints/{complaintId}` | Admin. Body `{status: "reviewed"|"resolved"}`. Komplain selesai tidak dapat dibuka kembali. |
| `POST` | `/api/admin/listings/{listingId}/moderate` | Admin. Body `{action: "take_down", reason}`; menurunkan listing. UI admin kemudian menandai komplain terkait selesai. |

`comment` ulasan boleh kosong dan maksimal 1.000 karakter. `rating` wajib berupa bilangan
bulat 1–5. `reason` komplain harus salah satu dari `hygiene`, `freshness`, `mismatch`, atau
`other`; `description` wajib 10–2.000 karakter.

## Validasi dan keamanan

- Hanya akun berperan **Pembeli** yang dapat membuat, melihat data pribadi, atau mengubah
  ulasan dan komplain. Endpoint ulasan toko bersifat publik.
- Ulasan hanya dapat dibuat untuk pesanan milik pembeli yang berstatus `picked_up` dan
  listing yang terhubung ke profil toko.
- Batas unik database `Review(user, listing)` mencegah ulasan ganda dari pembeli yang sama
  untuk produk yang sama, termasuk dua pengiriman yang berdekatan.
- Edit dan hapus ulasan hanya mengakses ulasan milik pengguna yang sedang masuk. Pesanan
  atau ulasan milik pengguna lain tidak dibocorkan.
- Komplain hanya dapat dibuat untuk pesanan milik pembeli yang berstatus `paid` atau
  `picked_up`, dan `Complaint` hanya mengizinkan satu laporan per pesanan.
- Status komplain bersifat baca di antarmuka pembeli. Endpoint perubahan status hanya
  dapat digunakan admin. Penurunan listing juga memerlukan alasan dan izin admin.
- Request tidak valid menghasilkan `400`; pengguna tanpa akses mendapat `403`, resource
  milik pengguna lain atau tidak ditemukan mendapat `404`, dan konflik batas unik mendapat
  `409`.

## Verifikasi backend

Dari `backend/`, aktifkan virtual environment lalu jalankan:

```bash
source .venv/bin/activate
python manage.py test main.test_reviews
python manage.py test main.test_admin_complaints
```

Suite ini mencakup kelayakan dan keunikan ulasan, rating tidak valid, edit/hapus dan
kepemilikan, rating publik toko, kelayakan serta duplikasi komplain, status dan kategori
tidak valid, akses anonim, pemisahan data antar pembeli, dan kebutuhan profil toko.
Tes akses admin, antrean komplain, perubahan status, dan penurunan listing ada di
`main.test_admin_complaints`.

## Verifikasi frontend

Jalankan Next.js dari `frontend/`:

```bash
npm run dev
```

Di terminal `frontend/` lain, jalankan Playwright dengan host yang sama seperti URL lokal
Next.js (`localhost`, bukan `127.0.0.1`, agar origin HMR sesuai):

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e -- tests/reviews.spec.ts
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e -- tests/admin-complaints.spec.ts
```

Tes Playwright memakai mock API dan mencakup kirim ulasan, edit/hapus ulasan, kirim
komplain, pengelolaan ulasan dan status komplain di akun pembeli, serta ringkasan rating
toko dan pengurutan ulasan. Backend tidak perlu dijalankan untuk suite frontend ini.
Tes `admin-complaints.spec.ts` menggunakan fixture tiruan untuk memilih laporan, mengubah
status, dan menurunkan listing melalui panel admin.
