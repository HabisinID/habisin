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
