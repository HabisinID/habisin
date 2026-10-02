# Deploy HABISIN ke PWS dan Vercel

Domain yang dipakai:

- Backend: https://rozan-laudzai-habisin-backend.pws.cs.ui.ac.id
- Frontend: https://habisin-id.vercel.app

## Alur request dan branch

Browser memanggil `/api/*` pada domain frontend. Next.js/Vercel meneruskan request
ke PWS melalui rewrite. Cookie tetap host-only dan `SameSite=Lax`; jangan menambahkan
`SESSION_COOKIE_DOMAIN` berisi domain PWS atau mengganti request browser menjadi URL
PWS langsung. Jalur ini tidak membutuhkan konfigurasi CORS lintas origin.

| Branch | Isi | Target |
| --- | --- | --- |
| `main` | Monorepo `backend/` dan `frontend/` | Pengembangan tim |
| `backend-prod` | Django di root, termasuk `manage.py` dan `requirements.txt` | PWS |
| `frontend-prod` | Next.js di root, termasuk `package.json` | Vercel |

Jangan merge keseluruhan branch deploy yang memindahkan folder kembali ke `main`.
Perbaikan sumber disimpan pada branch `fix/pws-vercel-deployment` untuk direview/merge
ke `main` secara terpisah. Perubahan yang sama dipasang pada branch deploy di path root.

## 1. Environment PWS

Masukkan melalui dashboard environment PWS (bukan ke Git):

```dotenv
DEBUG=False
SECRET_KEY=GANTI_DENGAN_SECRET_ACAK_BARU
ALLOWED_HOSTS=rozan-laudzai-habisin-backend.pws.cs.ui.ac.id
CSRF_TRUSTED_ORIGINS=https://habisin-id.vercel.app,https://rozan-laudzai-habisin-backend.pws.cs.ui.ac.id
WHITENOISE_USE_FINDERS=True
SEED_DEMO_ON_MIGRATE=True
```

Buat secret sekali di terminal lokal dan simpan nilainya di PWS:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'
```

Jangan kirim secret ke chat atau commit ke repository. Pertahankan nilai tersebut
antar-deploy agar sesi pengguna tidak terus dibatalkan.

- `ALLOWED_HOSTS`: hostname saja, tanpa `https://`, port, atau trailing slash.
- `CSRF_TRUSTED_ORIGINS`: origin lengkap dengan `https://`, tanpa trailing slash.
- Gunakan domain frontend yang stabil di atas. Preview Vercel dengan hostname lain
  perlu ditambahkan secara eksplisit jika memang ingin dipakai untuk login; jangan
  mempercayai seluruh `*.vercel.app`.
- `WHITENOISE_USE_FINDERS=True` memungkinkan aset admin disajikan dari aplikasi
  terpasang tanpa menjalankan `collectstatic` pada PWS.
- `SEED_DEMO_ON_MIGRATE=True` menjalankan seed setelah `migrate`, termasuk ketika tidak
  ada migration baru. Jika ada reservasi aktif, seed dilewati dan data tetap utuh.
  Flag ini khusus demo; nonaktifkan jika katalog sudah dikelola sebagai data nyata.

PWS tetap hanya perlu menjalankan perintah yang disediakan platform:

```bash
python manage.py migrate
python manage.py runserver
```

Tidak perlu menambahkan seed ke `runserver` atau menjalankan migrasi setiap request.
Ikuti pengaturan binding/port milik PWS; instruksi di sini tidak mengganti entrypoint
platform dengan server baru.

### Penyimpanan database

Kode saat ini tetap menggunakan SQLite sesuai stack proyek. *Persistensi filesystem
PWS belum dikonfirmasi.* File database tidak boleh di-commit. Jika PWS menyediakan
volume persisten yang writable, set `SQLITE_PATH` ke file di volume tersebut; direktori
induknya harus sudah ada. Jangan menyalin contoh path tanpa memeriksa volume sebenarnya.

Jika PWS tidak menyediakan penyimpanan persisten, akun/pesanan SQLite bisa hilang saat
container diganti. Gunakan database terkelola seperti PostgreSQL ITF setelah konfigurasi
Django disesuaikan. Menambahkan `DB_NAME`/`DB_PASSWORD` saja belum akan mengalihkan
backend ini ke PostgreSQL. [Tutorial PWS](https://pbp-fasilkom-ui.github.io/ganjil-2026/en/docs/tutorial-0)
menjelaskan kredensial ITF dan schema `tugas_kelompok`; jangan menggunakan database
produksi sebelum pilihan penyimpanan ini dipastikan.

### Kirim branch backend

Dari repository lokal, periksa remote `pws` terlebih dahulu:

```bash
git remote get-url pws
```

Remote proyek ini adalah `https://pws.cs.ui.ac.id/rozan.laudzai/habisin-backend`.
Setelah environment tersimpan, pengguna menjalankan:

```bash
git push pws backend-prod:master
```

Perintah mengirim branch lokal `backend-prod` ke branch `master` yang dipakai PWS.
Tidak perlu rename `main` atau berpindah branch. Jangan gunakan `--force` jika push
ditolak; periksa riwayat remote lebih dulu. Pantau log build, migrate, dan startup.
Jika perubahan environment tidak memulai deploy otomatis, lakukan redeploy melalui
kontrol PWS yang tersedia.

## 2. Environment dan build Vercel

Untuk struktur branch deploy yang sekarang, atur project Vercel:

| Pengaturan | Nilai |
| --- | --- |
| Git repository | `HabisinID/habisin` |
| Production Branch | `frontend-prod` |
| Root Directory | Root repository (`.`), bukan `frontend` |
| Framework Preset | Next.js |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Default Next.js; jangan isi `out` |

Di Environment Variables, isi untuk **Production**:

```dotenv
BACKEND_URL=https://rozan-laudzai-habisin-backend.pws.cs.ui.ac.id
```

Gunakan URL origin, tanpa `/api`. Tidak perlu `NEXT_PUBLIC_`: rewrite dibuat oleh
Next.js di sisi server/build. Konfigurasi baru sengaja menggagalkan build Vercel jika
variabel ini kosong atau mengarah ke localhost, supaya tidak deploy halaman yang API-nya rusak.

Pengguna mengirim branch frontend sendiri:

```bash
git push origin frontend-prod
```

Setelah mengganti environment, **redeploy dengan build baru**. Perubahan environment
tidak memperbaiki deployment lama secara retroaktif. Jangan memilih reuse existing build
untuk perubahan target rewrite. Pastikan deploy tersebut menjadi Production untuk alias
`habisin-id.vercel.app`.

Alternatif di masa depan: Vercel juga bisa memakai `main` dengan Root Directory
`frontend`. Jangan campur pengaturan root monorepo itu dengan branch `frontend-prod`.

## 3. Pemeriksaan setelah deploy

Jalankan pemeriksaan baca saja:

```bash
curl -i https://rozan-laudzai-habisin-backend.pws.cs.ui.ac.id/api/health
curl -i https://rozan-laudzai-habisin-backend.pws.cs.ui.ac.id/api/listings
curl -i https://habisin-id.vercel.app/api/health
curl -i https://habisin-id.vercel.app/api/auth/csrf
```

Hasil yang diharapkan:

- Health mengembalikan HTTP 200 dan JSON `{"service":"HABISIN API","status":"ok"}`.
  Endpoint ini memeriksa aplikasi hidup, bukan kesiapan database; cek katalog dan auth juga.
- Katalog mengembalikan JSON array. Demo berisi enam produk jika seed baru berjalan.
- CSRF mengembalikan `csrfToken` dan cookie `csrftoken` dengan atribut `Secure`.
- Respons API memakai `Cache-Control: private, no-store` agar CDN tidak menyimpan
  data akun, tiket, atau inventaris yang berubah.

Di https://habisin-id.vercel.app, daftar akun pembeli, refresh, pesan satu produk,
buka tiket, batalkan pesanan, dan logout. Di DevTools, request tetap menuju domain
Vercel; cookie `sessionid` harus `Secure`, `HttpOnly`, dan `SameSite=Lax`.

Data demo kedaluwarsa delapan jam setelah seed. Untuk memperbarui katalog, batalkan
semua reservasi aktif terlebih dahulu lalu jalankan ulang deployment yang mengeksekusi
`migrate` dengan `SEED_DEMO_ON_MIGRATE=True`. Ini bukan pembaruan otomatis tiap delapan jam.

## Troubleshooting

| Gejala | Perbaikan |
| --- | --- |
| PWS HTTP 400 `DisallowedHost` | Perbaiki `ALLOWED_HOSTS`, simpan environment, lalu restart/redeploy. |
| Vercel `DNS_HOSTNAME_RESOLVED_PRIVATE` | Periksa `BACKEND_URL`; build lama mungkin masih memakai `127.0.0.1`. Isi URL publik lalu build/redeploy ulang. |
| POST login/register 403 CSRF | Periksa origin frontend persis di `CSRF_TRUSTED_ORIGINS`, refresh halaman, dan pastikan request tetap lewat `/api` Vercel. |
| Cookie tidak tersimpan | Gunakan HTTPS dan cookie host-only. Jangan memberi domain PWS pada cookie yang diterima browser melalui Vercel. |
| Admin tanpa CSS | Pastikan `WHITENOISE_USE_FINDERS=True` dan perubahan middleware sudah ikut terdeploy. |
| Katalog kosong | Periksa log seed, reservasi aktif yang membuat seed dilewati, dan waktu kedaluwarsa. |
| Health 200 tetapi katalog 500 | Periksa log migrasi/database; health bukan pemeriksaan koneksi database. |
| PWS 502 saat startup | Periksa status dan log build/startup. Jangan menganggap deploy berhasil hanya karena push berhasil. |
| Data hilang setelah redeploy | Pastikan SQLite ada di volume persisten; jika tidak, pindah ke database terkelola. |

## Referensi

- [PWS dan konfigurasi proyek Django](https://pbp-fasilkom-ui.github.io/ganjil-2026/en/docs/tutorial-0)
- [WhiteNoise: static files tanpa collectstatic](https://whitenoise.readthedocs.io/en/stable/django.html#WHITENOISE_USE_FINDERS)
- [Vercel external rewrites](https://vercel.com/docs/rewrites)
- [Vercel build dan Root Directory](https://vercel.com/docs/builds/configure-a-build)
- [Vercel Git deployment](https://vercel.com/docs/git)
