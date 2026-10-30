# Moderasi dan retensi riwayat

## Rute melalui frontend

Rute aksi DRF admin memakai slash akhir, misalnya
`POST /api/admin/listings/:id/take-down/` dan `POST /api/admin/listings/:id/restore/`.
Rute workspace seperti `POST /api/admin/listings/:id/moderate` dan halaman
kasir Django `/api/partner/kasir` tetap tanpa slash.

Proxy Next mempertahankan bentuk URL tersebut, metode POST, body, sesi dan
CSRF. Jangan menambahkan normalisasi slash global yang mengalihkan POST ke
bentuk URL lain. `frontend/tests/admin-api-proxy.spec.ts` menguji kontrak ini
melalui server frontend dan backend sementara.

## Take-down dan pemulihan

Kedua endpoint take-down memakai transaksi yang sama. Pesanan pending/paid
dibatalkan dengan `cancelled_by=admin` dan alasan admin; stok yang masih ditahan
dikembalikan tepat sekali. Retry tidak menggandakan stok atau entri pada
masing-masing log. Pesanan selesai/expired/cancelled tidak dilepas stoknya lagi.
Penanda `taken_down` dan `moderated_at` diselaraskan, sementara pembacaan data
legacy tetap mengenali salah satunya. Semua mutasi mitra terkunci (HTTP 409).

Pemulihan melalui salah satu jalur membersihkan kedua penanda, tetapi listing
tetap nonaktif sampai ditayangkan mitra dan tiket yang dibatalkan tetap batal.
`ModerationLog` serta `AdminModerationLog` dipertahankan sebagai tabel terpisah.
Stok transaksi lama yang sudah salah tidak dikoreksi secara spekulatif.

## Arsip pesanan dan listing

`DELETE /api/reservations/:id` mengisi `buyer_archived_at` untuk picked_up,
cancelled atau expired dan tetap menghasilkan 204. Permintaan berulang aman.
Pesanan aktif ditolak 409; akun lain dan halaman pesanan yang sudah diarsipkan
mendapatkan 404. Hanya daftar/detail transaksi pembeli yang menyembunyikannya.
Komplain, ulasan, log verifikasi, riwayat penjual/admin, serta angka penjualan
tetap memakai transaksi yang sama. Hak feedback pemilik tetap mengikuti syarat
status sebelumnya. Kasir yang mengurungkan pengambilan dalam batas yang sah
mengembalikan pesanan ke daftar aktif pembeli; listing terhapus atau diturunkan
tidak boleh dihidupkan kembali lewat undo kasir.

Penghapusan listing selalu mengisi `deleted_at` dan `active=False`. Foto dan
relasi dipertahankan, termasuk untuk listing tanpa pesanan. Penghapusan toko
fisik yang dilindungi relasi tetap dapat ditolak; gunakan tutup toko permanen.
Kebijakan hapus akun dan retensi media jangka panjang berada di luar perubahan
ini. Data yang dahulu sudah terhapus memerlukan backup untuk dipulihkan.

Migrasi baru menambah kolom arsip nullable tanpa menyembunyikan transaksi lama.
Gunakan backup dan tinjau `migrate --plan` sebelum migrasi database kerja;
pengujian otomatis memakai database/media sementara.
