# Perbaikan benturan log moderasi

Basis investigasi: `main` pada `656e586` (29 Oktober 2026). Perbaikan ini menangani integrasi Modul 6 dengan workspace admin, tanpa menghapus salah satu API.

## Penyebab dan perubahan

| Temuan | Perbaikan |
| --- | --- |
| Dua kelas `ModerationLog` saling menimpa di `models.py` | Log workspace menjadi `WorkspaceModerationLog`; log Modul 6 tetap `ModerationLog` |
| Dua migration `0013` membuat tabel yang sama | Operasi historis memakai helper create yang mengenali skema berdasarkan kolom dan mempertahankan tabel/data yang sudah ada |
| Workspace membaca `actor`/`listing`, sedangkan model aktif hanya memiliki `admin_user`/`action_type` | Import dan query workspace memakai model workspace tersendiri |
| Status moderasi memiliki dua representasi yang tidak konsisten | Semua aksi admin memakai `set_listing_moderation()`; filter dan guard menerima kedua flag untuk data lama |
| Filter publik kehilangan pemeriksaan `moderated_at` | Katalog memeriksa `taken_down=False` sekaligus `moderated_at IS NULL` |
| GET inventaris punya return duplikat sebelum filtering arsip/expiry | Return lama dihapus; respons kembali memakai `PartnerListingReadSerializer`, termasuk `has_active_orders` |
| Listing diturunkan tidak bisa dibaca oleh pemiliknya | GET detail tetap tersedia; mutasi tetap ditolak dengan `409` |
| Take-down Modul 6 membatalkan pesanan tanpa melepas stok | Pesanan aktif dikunci, dibatalkan sekali dan stok dikembalikan dalam transaksi yang sama |
| Pembatalan admin terlihat seperti pembatalan pembeli | `cancelled_by="admin"` dan label frontend yang sesuai; alasan tetap diteruskan ke pembeli |
| Persetujuan mitra membaca status sebelum lock | Status diperiksa ulang sesudah row lock, sehingga approval/rejection tidak diproses dua kali |
| API DRF berakhiran slash terjebak redirect Next.js ↔ Django | Next.js mempertahankan slash pada API admin; endpoint workspace tanpa slash tetap terpisah |
| Fixture lama menganggap seluruh mitra langsung boleh beroperasi | Fixture backend memakai mitra approved; fixture browser meminta persetujuan melalui API admin sebenarnya pada backend sementara |

## Dua model, dua kontrak yang tetap didukung

- `WorkspaceModerationLog` → `main_workspacemoderationlog`: `listing`, `actor`, `target_name`, `store_name`, `action`, `reason`, `created_at`. Digunakan endpoint workspace seperti `/api/admin/summary` dan `/api/admin/moderation-logs` (tanpa slash).
- `ModerationLog` → `main_moderationlog`: `admin_user`, `action_type`, `target_name`, `reason`, `created_at`. Digunakan ViewSet Modul 6, misalnya `/api/admin/moderation-logs/` (dengan slash).

Keduanya didaftarkan di Django admin. Relasi pengguna workspace memakai nama `workspace_moderation_logs`, sehingga tidak berbenturan dengan log Modul 6.

Take-down workspace tetap mempertahankan tiket lama sesuai kontraknya. Take-down Modul 6 tetap membatalkan pesanan aktif sesuai kontrak Modul 6; perbaikannya memastikan stok dan aktor pembatalan benar. Restore dari salah satu API membersihkan kedua flag, tetapi tidak otomatis menayangkan listing: mitra mengaktifkannya kembali.

## Strategi migrasi data

`0019_repair_moderation_log_models` berjalan setelah merge `0018`. Perbaikan pada dua migration historis diperlukan karena database baru berhenti pada `0013` sebelum migration baru dapat dijalankan. Jangan menghapus migration lama atau mengubah catatan `django_migrations` secara manual.

Helper pada `main/migrations/_moderation_logs.py` menangani:

1. Database baru: membuat dua tabel dengan nama berbeda.
2. Database lama workspace: mengenali kolom `actor_id`, `listing_id`, `store_name`, dan `action`; memindahkan tabel ke nama workspace sebelum membuat tabel Modul 6.
3. Database lama Modul 6: mempertahankan tabel serta log Modul 6, kemudian membuat tabel workspace yang belum ada.
4. Kedua migration sudah tercatat tetapi tabel masih berformat workspace: migration `0019` memisahkan tabel yang benar dan membuat yang belum ada.
5. Perbaikan parsial menyisakan dua tabel workspace: baris berbeda tetap dipertahankan, termasuk bila ID bertabrakan; sequence PostgreSQL direset agar insert selanjutnya tidak berbenturan.

Untuk skema yang tidak dikenali/ambigu, proses dihentikan dengan pesan jelas; tidak ada penggantian tabel diam-diam. Nama file helper adalah bagian dari riwayat migration dan harus tetap tersedia pada deployment mendatang.

Migration juga menandai pembatalan lama sebagai tindakan admin **hanya** untuk record `cancelled` dengan aktor kosong dan pesan persis `Listing diturunkan oleh admin.`. Stok transaksi lama tidak ditambah secara otomatis: operator perlu merekonsiliasinya karena stok mungkin sudah diperbaiki manual sejak transaksi terjadi.

## Menjalankan di lingkungan tujuan

Periksa konfigurasi database dan buat backup database/media terlebih dahulu. Setelah kode perbaikan tersedia:

```bash
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate --plan
python manage.py migrate
python manage.py showmigrations main
```

Migration sudah disertakan; tidak perlu membuat merge migration lain. Jangan memakai `--fake` untuk melewati benturan tabel. Jangan mencoba downgrade melintasi migration cabang lama sebagai cara rollback data; gunakan prosedur restore backup yang sudah ditinjau. Migration `0019` tidak mencoba mengembalikan pembagian tabel ke skema bentrok sebelumnya.

Restart backend setelah migration berhasil. Perubahan `frontend/next.config.ts` memerlukan restart frontend dev, atau build dan restart frontend produksi:

```bash
cd frontend
BACKEND_URL=http://127.0.0.1:8002 npm run build
BACKEND_URL=http://127.0.0.1:8002 npm run start -- --hostname 127.0.0.1 --port 3000
```

Sesuaikan URL backend dengan lingkungan sebenarnya. Hentikan proses frontend sebelumnya sebelum memakai port yang sama. Penerapan pada database kerja/PWS tidak dilakukan otomatis oleh perbaikan source ini.

## Verifikasi dan batasnya

Hasil lokal: 221 tes Django lulus, coverage aplikasi 96%, migrasi database kosong serta pemeriksaan drift lulus. Suite browser berisi 141 kasus: 136 lulus pada putaran utama; lima kasus dengan locator login/tab lama dan sisa fixture lulus setelah penyesuaian tes serta pengulangan pada database sementara bersih. Lint, TypeScript, build produksi Webpack dan pemeriksaan whitespace lulus.

Eksekusi database pada pemeriksaan ini memakai SQLite sementara. PostgreSQL/PWS belum diuji langsung; Docker daemon lokal tidak tersedia. Jalur PostgreSQL pada helper menyediakan reset sequence dan isolasi schema untuk pengujian upgrade, tetapi itu bukan bukti migration produksi sudah berhasil dijalankan.

- Migration baru, upgrade dari kedua cabang lama, log dengan ID bertabrakan, insert setelah repair, dan kedua kontrak API diuji pada database sementara.
- Test upgrade memakai database/schema terpisah; tidak menurunkan seluruh skema database tes bersama melewati sibling migration SQLite yang dapat membangun ulang tabel dari state cabang berbeda.
- Regresi backend mencakup permission pending/rejected/missing-approval, takedown, restore lintas API, pengembalian stok satu kali, privasi tiket, arsip, dan katalog.
- Browser memeriksa status inventaris/lock, pesan pembatalan admin, restore, approval melalui proxy, tema, logout serta viewport HP/laptop.
- Backend browser CI memakai `serve-backend.py` dan akun admin khusus database sementara. Kredensial uji tidak mengubah atau memberi persetujuan otomatis kepada akun produksi.
- Perubahan kode tidak dengan sendirinya memperbarui `main` remote atau database pengguna. Commit, push, merge, dan deployment merupakan langkah terpisah.
