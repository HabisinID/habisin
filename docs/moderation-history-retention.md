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
