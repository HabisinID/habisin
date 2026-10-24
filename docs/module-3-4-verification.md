> **Kontrak terbaru integrasi main:** [panduan integrasi](integrate-main-modules-3-4.md). Bagian audit bertanggal di bawah adalah bukti historis, termasuk fitur keranjang/pembatalan mitra yang kini ditunda.

# Verifikasi revisi Modul 3 dan Modul 4

## Menjalankan suite tanpa menyentuh data kerja

Dari root repository, gunakan tiga terminal. Hentikan backend normal yang memakai port 8000 terlebih dahulu.

Terminal 1:

```bash
cd backend
.venv/bin/python ../frontend/tests/serve-backend.py
```

Script ini membuat SQLite dan media **sementara**, menerapkan migrasi, serta menyiapkan enam listing demo. Hasil upstream geocoding untuk dua alamat fixture dimasukkan ke cache; validasi token, konfirmasi pin, sesi, API toko/listing, upload storage, reservasi dan pembatalan tetap menggunakan backend Django sebenarnya. Ctrl+C membersihkan direktori sementara. Tidak ada seed atau reset pada database kerja.

Terminal 2:

```bash
cd frontend
npm run build -- --webpack
npm run start -- --hostname 127.0.0.1
```

Terminal 3:

```bash
cd frontend
npm run test:e2e
```

Browser Chromium harus sudah tersedia. Fixture browser mengendalikan foto publik/tile agar tes tidak bergantung pada layanan pihak ketiga. Kegagalan API, GPS, tile dan impor library dalam `map.spec.ts` sengaja disimulasikan. `map-real.spec.ts` dan tes CRUD/upload memakai API Django sebenarnya; keduanya bukan bukti akses upstream Nominatim atau deployment publik.

## Cakupan

- Migrasi satu → beberapa toko mempertahankan ID/data; adapter singular menolak beberapa toko dengan 409.
- Listing wajib memilih cabang; snapshot alamat/pin dari server; transaksi dan konflik pesanan aktif melindungi pengambilan.
- Upload/URL, crop 4:3, landscape/portrait/EXIF, keyboard dan pinch; validasi format/ukuran, kompensasi gagal, cleanup orphan.
- Selector daftar/peta yang sama; marker per ID toko; fallback legacy; toko satu koordinat dapat dipilih sendiri.
- Popup → profil → deep link → detail/reservasi yang sama; loading/error/retry/kosong/404 terpisah.
- Pan/zoom, repeated toggle, resize, keyboard/fokus, GPS opt-in/fallback, expiry, request usang, tile/library gagal.
- Pemeriksaan 1440×900 dan 390×844 serta overflow; screenshot berada di `/tmp/habisin-*`.

## Batas operasional

- SQLite lokal menguji perilaku transaksi, bukan pembuktian konkurensi PostgreSQL produksi.
- Media lokal membutuhkan volume persisten pada deployment; `STORAGES` dapat diganti, tetapi cloud storage belum diintegrasikan.
- Listing legacy tidak ditautkan ke toko berdasarkan tebakan nama/koordinat.
- Refresh terjadi saat fokus/retry/mutasi lokal, bukan realtime. Server selalu memvalidasi ulang pesanan.
- Turbopack pada lingkungan audit gagal saat membuat proses/binding port (`Operation not permitted`). Build Webpack dipakai sebagai fallback dan hasilnya diuji melalui browser.
- Audit npm dibandingkan lockfile baseline: tujuh temuan yang sama (enam high, satu critical), tanpa temuan baru dari react-easy-crop. Perbaikan dependency di luar scope tidak diterapkan otomatis.

## Git dan rollback

Branch implementasi Modul 3–4 adalah **`feat/modul-3-4-listing-food-map-explorer`**, dengan base merge `e31ac1a`. Sebelas commit lokal yang semula dibuat pada `feat/logged-in-discovery-redesign` ditempatkan pada branch implementasi ini melalui fast-forward, sesuai koreksi pengguna; branch implementasi tersebut menjadi branch aktif. Branch `feat/modul-3-listing-media-stores` dan `feat/modul-4-store-map-explorer` merupakan branch persiapan tahap sebelumnya dan tidak otomatis dimajukan.

Atas permintaan pengguna, source dikelompokkan dalam Conventional Commits lokal: listing/media, checkout, lifecycle reservasi, UI/branding, composer, peta, workspace, landing, CSRF development, pengujian dan dokumentasi. Lihat `git log --oneline` untuk hash aktual. Tidak melakukan push. Database, akun/listing/pesanan pengguna, upload media, environment rahasia, artefak OpenSpec/AI dan hasil browser tidak termasuk commit. Catatan “belum di-commit” pada hasil audit bertanggal di bawah merupakan keadaan saat audit tersebut berlangsung.

Rollback UI dapat dilakukan lebih dahulu. Cadangkan database dan MEDIA_ROOT sebagai pasangan. Jangan membalik migrasi beberapa toko/file saat data baru masih bergantung padanya. Endpoint katalog toko additive dapat dipertahankan bila UI peta di-rollback. Sync/archive OpenSpec menunggu permintaan pengguna dan rekonsiliasi rencana lama.

## Hasil audit implementasi — 23 Oktober 2026

| Pemeriksaan | Hasil terverifikasi |
| --- | --- |
| Django tests | 56 lulus, 15,3 detik, database tes terpisah |
| Django check / migration drift | Tidak ada isu / tidak ada perubahan migrasi tertinggal |
| ESLint / TypeScript | Lulus |
| Build default Turbopack | Gagal karena pembatasan proses/port lingkungan |
| Build produksi Webpack | Lulus; build ini dipakai untuk tes browser |
| Playwright penuh | 33 lulus, 59,2 detik, backend/media sementara |
| Pemeriksaan screenshot ulang | Popup desktop/mobile menunggu animasi selesai; tidak overflow, font lokal dan kontrol terlihat |
| OpenSpec strict | Kedua change valid; 27/27 dan 22/22 tugas selesai |
| Git | Diff whitespace bersih; index kosong; tidak ada commit/push baru |

Pencil MCP berhasil mengakses `/Users/ano/Documents/Habisin-Design/design.pen`. Form `PBcFG`, input `u9cag`, popup `PJwPs`, serta token warna/radius/font dibaca sebagai panduan; tidak ada perubahan pada desain. Layout beranda keseluruhan bukan klaim salinan pixel desain.

Migrasi lokal diterapkan setelah backup SQLite di luar repository. Seluruh field lama pada **8 listing dan 1 toko** dibandingkan sebelum/sesudah dan tetap identik; tidak ada reset/seed pada database kerja. Server lokal frontend dan API memberikan HTTP 200. Console anonim menampilkan 403 yang memang diharapkan dari `/api/auth/me`. Satu URL foto pada data kerja lama tidak memberi respons gambar (`ERR_BLOCKED_BY_ORB`); UI menampilkan **Foto tidak tersedia** dan URL pengguna dipertahankan.

Peringatan `staticfiles` belum ada berasal dari konfigurasi lokal WhiteNoise; tes/check tetap lulus. Log kegagalan geocoding pada tes merupakan failure fixture yang disengaja. Tidak ada bukti deployment publik atau integrasi cloud storage yang diklaim.

## Revisi dashboard login dan detail — 24 Oktober 2026

Rencana berada pada change OpenSpec lokal `authenticated-discovery-food-details`. Sumber Pencil yang dibaca langsung: `JNYMp` Dashoard-Login, `EpHTa` Kartu Makanan (2), `h0jC3k` Kartu Makanan (3), dan `zOewl` Map-makanan. Header JSX dibandingkan snapshot sebelum revisi dan identik; landing/modal anonim serta kategori awal dipertahankan. Mobile merupakan adaptasi dari frame desktop, dengan foto → panel pemesanan → metadata pada detail.

Perubahan utama: komponen `authenticated-discovery`, `food-post-card`, `food-listing-detail`, clock/countdown bersama, filter stok/jarak/bounds/pickup, varian peta daftar kiri 440 px, form WIB dan metadata, serta `reservation_policy` di backend. Tanpa dependensi baru atau perubahan desain.

| Pemeriksaan final | Hasil |
| --- | --- |
| Django | 66 tes lulus, 13,995 detik; baseline 56 |
| Playwright | 41 tes lulus, sekitar 1 menit; baseline 33 |
| ESLint / TypeScript | Lulus |
| Build produksi | `npm run build -- --webpack` lulus |
| Django check / migration drift | Bersih |
| OpenSpec | Strict valid; tiga kapabilitas, sembilan tugas |
| Browser CLI | Desktop 1440×900 dan mobile 390×844; dashboard, detail, peta, fokus/keyboard, console dan jaringan diperiksa |
| Console login | Tidak ada error/warning pada inspeksi final; 403 auth/me sebelum login merupakan perilaku anonim yang diharapkan |

Tes baru memeriksa field URL/upload/legacy, kuota WIB lintas cabang, satu tiket gratis aktif, stok saat penolakan, cancelled retry, pembatalan tepat 30 menit vs 29:59, countdown/expiry tanpa reload, empat kolom, harga tinggi tanpa filter tersembunyi, metadata, filter/favorit, peta split/area/instance, offline dan error/retry kuota/katalog. API sesi, media, transaksi dan data pada skenario integrasi memakai Django nyata dalam database sementara. Foto/tile pada suite deterministik adalah fixture; pemeriksaan CLI juga menerima gambar Unsplash dan tile OSM nyata. Ini bukan bukti akses Nominatim atau deployment.

Screenshot final: `/tmp/habisin-final-dashboard-desktop.png`, `/tmp/habisin-final-detail-desktop.png`, `/tmp/habisin-final-detail-mobile.png`, `/tmp/habisin-final-map-desktop.png`, `/tmp/habisin-final-map-mobile.png`; screenshot suite dashboard mobile berada di `/tmp/habisin-login-dashboard-mobile.png`.

Backup database kerja: `/private/tmp/habisin-pre-discovery-08r2g1et/db.sqlite3` (mode 0600), beserta manifest hash per tabel. Migrasi `0008_food_preparation_information` diterapkan tanpa seed/reset. **Seluruh nilai lama di 16 tabel identik**, termasuk 3 pengguna, 9 listing, 1 toko dan 1 reservasi. Sembilan listing lama tetap tanpa prepared_at/metadata buatan. Media kerja tidak diubah. Server pengujian dihentikan dan backend dikembalikan ke database kerja.

Batas yang tetap berlaku: validasi final oleh server; clock perangkat hanya indikator, kuota UI disegarkan tiap 15 detik/fokus/mutasi; transaksi SQLite belum membuktikan konkurensi PostgreSQL; pembayaran dan verifikasi pengambilan tetap demo existing. Build default Turbopack tidak diklaim lulus pada revisi ini. File OpenSpec tetap lokal, tidak di-sync/archive. Tidak ada stage, commit, push, atau perubahan lockfile baru pada revisi dashboard ini.

## Revisi form Tambah listing — 24 Oktober 2026

### Sumber dan keputusan

Pencil MCP berhasil membaca dokumen aktif `/Users/ano/Documents/Habisin-Design/design.pen`, baris mobile `ob72c` dan desktop **Baris 9 · Mitra · Tambah listing** `ZYbkw` (`Qu4H1`/`u6XLn`). Desain tidak diubah. Rencana lokal OpenSpec: `listing-composer-design-fidelity`.

Pengguna memilih nama maksimal 60 karakter serta harga berbayar lebih rendah dari harga normal. Aturan berlaku di UI dan API untuk create/perubahan nilai. Nama panjang/harga sama dari data lama tidak dipotong atau dimutasi otomatis; PATCH kolom lain tetap kompatibel.

### Hasil implementasi dan alur yang dipertahankan

- Composer fullscreen menggantikan form di dalam inventaris; header beranda tetap identik dengan snapshot awal sesi.
- Desktop: sidebar 248 px, preview 400 px, foto 320×240, input 48 px pada viewport 1440×900. Identitas di samping foto, donasi berbingkai, chip terpilih hijau, harga/porsi dan jam/catatan sejajar; CTA menetap.
- Mobile 390×844: app bar 56 px, pad 16 px, foto 4:3, input/CTA 48 px, chip/stepper/switch/jam cepat, CTA berakhir pada y=828. Tidak menggambar status jam/sinyal OS.
- Pilihan toko wajib, alamat/pin dari server, deskripsi, waktu dibuat WIB, tanggal/jendela pengambilan, kemasan/penyimpanan/alergen tetap tersedia pada **Detail toko & informasi makanan**. Error otomatis membuka bagian tersebut dan memindahkan fokus.
- URL/upload/crop tetap tersedia; upload multipart memakai CSRF/sesi dan progres bytes XHR, tanpa persen tiruan. File dan isian tidak hilang saat error/retry. Ukuran/format/crop dan konflik pesanan aktif tetap divalidasi.
- Simpan/pulihkan draf IndexedDB per akun/create-edit, termasuk File hasil crop. Kesalahan storage terlihat dan tidak menghalangi publikasi. Ini penyimpanan lokal, bukan server atau sinkronisasi perangkat.
- Salin hanya inventaris sendiri; foto upload menjadi File baru, URL tetap URL, waktu dibuat dikosongkan, tanggal ambil memakai hari ini WIB, toko tutup tidak dipilih. Sumber tetap utuh dan tidak ada publikasi otomatis.
- Success create menampilkan snackbar/Lihat serta Tambah listing lain; edit kembali inventaris. Status busy inventaris dibersihkan walaupun composer edit sudah ditutup, sehingga CRUD berikutnya tetap aktif.
- Catatan `buyer_notes` opsional max140 ada di JSON/multipart/detail. Kategori Kue basah, Sayur & buah, Lainnya additive; kategori lama tetap dapat dipilih.

### Quality gates

| Pemeriksaan | Bukti akhir |
| --- | --- |
| Baseline sebelum revisi | 66 tes Django dan 41 tes browser lulus |
| Django penuh | 68/68 lulus, 18,852 detik; database tes terpisah |
| Django check / migration drift | Tidak ada isu / tidak ada perubahan tertinggal |
| ESLint / TypeScript | `npm run lint` dan `npx tsc --noEmit` lulus |
| Build produksi | `npm run build -- --webpack` lulus; build ini dipakai browser |
| Playwright penuh | 47/47 lulus, 1,4 menit; backend/media sementara baru |
| Alur baru | Enam tes composer: ukuran/preview/notes, mobile/validasi/harga donasi, draf File/reload/publish/copy, kepemilikan/toko tutup, storage gagal, isolasi akun |
| Regresi | CRUD/otorisasi/konflik reservasi, crop landscape/portrait/EXIF, retry/URL, toko, discovery/peta/GPS/expiry, reservasi/batal, akun dan styling |
| Pemeriksaan CLI | Upload/crop → isi → gratis → tayang → tambah lagi → salin → error waktu dibuat; desktop/mobile tanpa overflow, console 0 error/0 warning; POST listing 201, media 200, empat tile OSM 200 |
| Git | Diff whitespace bersih, index kosong, branch `feat/logged-in-discovery-redesign`; tidak stage/commit/push |
| OpenSpec / server lokal | Strict valid, 7/7 tugas selesai; frontend 3000 dan API melalui 3000/8000 HTTP 200 setelah backend dipulihkan ke DB kerja |

Percobaan awal menemukan status busy setelah edit yang terkunci; diperbaiki lalu CRUD lulus. Satu tes crop sempat mengisi search anonim sebelum sesi selesai dimuat; tes kini menunggu explorer login. Run penuh pertama menemukan jumlah fixture berlebih dari percobaan gagal/sesi visual; database **sementara** dibuat ulang dan seluruh 47 tes diulang tanpa mutasi sesi visual paralel. Data kerja tidak di-seed/reset untuk pengujian.

### Data dan batas bukti

Backup kerja terbaru: `/private/tmp/habisin-pre-composer-q89atslz/db.sqlite3` (direktori 0700, file 0600). Migrasi `0009_listing_buyer_notes` diterapkan. Hash seluruh nilai kolom lama pada **16 tabel** identik sebelum/sesudah, termasuk **9 listing, 1 toko dan 2 reservasi**. Sembilan listing mendapat catatan kosong; media lama tidak diubah. Snapshot source sebelum revisi berada di direktori sementara terpisah. Dependency, lockfile, global CSS, komponen peta/discovery dan header existing tetap identik terhadap snapshot sesi.

Screenshot pemeriksaan ada di `/tmp/habisin-composer-cli-{empty-desktop,filled-desktop,filled-mobile,free-mobile,success-mobile,copy-mobile,validation-mobile,map-loaded}.png`. Elemen inti diukur dan susunan dibandingkan dengan Pencil. Tidak mengklaim semua piksel identik: opsi URL/crop/detail wajib tambahan dipertahankan, isi berasal dari akun nyata, kategori tambahan memiliki jumlah nyata, preview/peta menggunakan toko aktual. Menu verifikasi dan pesanan mitra yang belum diimplementasikan diberi status belum tersedia, tanpa angka contoh.

Draf lokal bergantung izin/kuota IndexedDB; provider tile/foto tetap eksternal. Pengujian deterministik memfixture foto/tile/geocoding; CLI tile OSM berhasil, bukan bukti upstream Nominatim atau cloud storage. Konkurensi PostgreSQL dan deployment publik belum diverifikasi. Server frontend lokal memakai build produksi Webpack; setelah mengubah source, rebuild/restart atau gunakan dev server. Tidak ada dependency yang dipasang pada revisi ini.

## Navigasi per peran, keranjang, tiket dan dashboard — 24 Oktober 2026

### Sumber, persetujuan dan implementasi

Change lokal **`buyer-map-cart-partner-workspace`** dibuat, divalidasi strict, lalu langsung diimplementasikan sesuai permintaan pengguna. Source Pencil dibaca melalui MCP tanpa mengubah desain: `j9UsPw` (peta), `M0tCS7` (states3), `JNYMp` dalam `KDnSN` (daftar), `oHmMs` (header), `jUAQt` dalam `Bato8` (tiket), `IzNzp` dalam `OYycs` (dasbor mitra). Frame bernama **Mitra Dashboard** `ZYbkw` ternyata berisi form listing; pengguna mengonfirmasi **Baris10** untuk halaman awal mitra. Pengguna memilih **tiket/kode per listing** dan **kode teks dahulu, QR menyusul**.

- Pembeli pertama kali melihat **Peta**; daftar tetap tersedia. Header64px desktop memakai logo Sprout/habisin existing, search/lokasi/Jelajahi/Favorit/Keranjang/Pesanan/Akun. Kontrol pencarian/lokasi tidak diduplikasi di body pembeli. Pill memakai surface2 `#F6EACB`, aktif putih dan border `#7A8872` sesuai sumber.
- Pin mengelompokkan ID toko, menampilkan nama dan min–max harga hasil filter. Harga tunggal tidak diulang; nol diberi label Gratis. Nama panjang dipotong visual agar harga tetap terbaca. HTML pada nama ditampilkan sebagai teks, bukan di-inject.
- Klik kartu peta memfokuskan toko pada zoom16 dan menyorot kartu/pin hijau `#3E6B26`; dua tingkat zoom keluar melepas seleksi. Marker dan daftar juga tersinkronisasi; Escape/filter yang menghilangkan pilihan membersihkan seleksi. Tombol Lihat detail tetap tersedia.
- Detail memiliki tombol putih **Masukkan keranjang** di atas pembayaran. Keranjang lokal per akun mendukung kelompok toko, pilihan toko/item, porsi1–10, hapus, total pilihan dan checkout simulasi. Menambah tidak mencadangkan stok. Stok/harga/toko/deadline dan kuota selalu diperiksa server.
- Checkout pilihan dilakukan dalam satu transaksi dengan token UUID/fingerprint; gagal satu item mengembalikan seluruh perubahan. Retry identik mengambil hasil lama. Token/isi pembayaran yang hasilnya belum pasti disimpan lokal; reload dan retry tetap tidak membuat tiket ganda, termasuk bila stok terakhir sudah habis pada transaksi pertama.
- Receipt mengikuti Baris6: struk440px/info dua kolom desktop, satu kolom mobile, kode nyata5karakter, total simulasi, waktu/alamat/status/rute dan pembatalan inline. Pesanan lama tetap tersedia. QR dan verifikasi kasir tidak dipalsukan; pembayaran membuat reservasi, verifikasi kelak menandai pengambilan.
- Mitra masuk ke Baris10: sidebar248px, periode performa, porsi terpesan/nominal simulasi, pengambilan hari ini, listing tayang dan Pesanan. Angka dari data akun sendiri, bukan contoh desain atau klaim makanan sudah diambil. Listing/profil toko/akun memakai alur existing. Salin dari listing kemarin langsung membuka form dan sheet pilihan; Tambah listing langsung membuka form baru.
- Tandai habis memakai API terotorisasi dengan token undo60detik yang sekali pakai. StockPATCH dan pembatalan mencabut token lama; token expired/stock berubah ditolak, tanpa menimpa stok terbaru. Verifikasi kode diberi status belum tersedia.

### Kontrak API dan data

- `POST /api/checkout`: `{key:UUID, items:[{listing_id,quantity,expected_price}]}`, pilihan1–20 listing berbeda; `201` hasil baru, `200` replay identik, `409` harga/stok/ketersediaan/kuota/token konflik. Buyer saja. Satu tiket per listing; aturan satu tiket gratis aktif tetap berlaku walaupun beberapa makanan dipilih bersamaan.
- `GET /api/partner/dashboard?period=today|week|month|year`: data owner sendiri, series/performa/pengambilan/pesanan/listing/toko. Performa tidak menghitung pesanan dibatalkan. Refresh saat fokus, setiap30detik dan setelah perubahan.
- `POST /api/partner/listings/:id/sold-out`: mengembalikan listing stok0, undo_token dan expires_at. `POST .../undo-sold-out` menerima `{token}`. Token berasal dari DB, bukan restore stok yang dihitung client.
- Migrasi additive **`0010_listingstockaction_checkoutbatch`** menambah dua tabel. Backup kerja: `/private/tmp/habisin-pre-workspaces-rrk346uy/db.sqlite3`, direktori0700/file0600. Seluruh baris/kolom lama pada **16 tabel tetap identik**, termasuk **9 listing, 1 toko, 3 reservasi**. Metadata Django menambah2contenttypes dan8permissions untuk model baru; data lama tidak diubah. Tidak ada seed/reset kerja atau perubahan media kerja.

### Bukti verifikasi

| Pemeriksaan | Hasil akhir |
| --- | --- |
| Django penuh | **76/76 lulus**, 18,908 detik; baseline sebelumnya68 |
| Tes API baru | 8 tes: checkout/replay/tokenconflict, rollback harga/stok/expiry/aktif, kuota gratis, input/peran/toko tutup, dashboard owner/periode, undo ownership/sekali/expiry/stockPATCH/cancel |
| Playwright penuh | **55/55 lulus**, 1,5 menit; baseline sebelumnya47 |
| Tes browser baru | 8 tes: ranges/filter/ID, default map/header/pill/zoom clear, cart kelompok/persist/pilihan/tiket, staleprice, lostresponse→reload→replay tanpa duplikasi, akun terpisah/mobile, dashboard operasi/undo/navigasi, loading/error/retry/kosong |
| Lint / TypeScript | `npm run lint` dan `npx tsc --noEmit` lulus |
| Build | `npm run build -- --webpack` lulus; build produksi tersebut dipakai browser |
| Django check / drift | Tidak ada isu / tidak ada migrasi tertinggal |
| OpenSpec | Strict valid; seluruh6tugas implementasi/integrasi diverifikasi |
| CLI visual | Desktop1440×900/mobile390×844, seleksi pin/range, header/list, dashboard dan shortcut copy: tidak overflow, error JavaScript0, console0error/0warning; tile OSM dan foto Unsplash200 |
| Git | Branch `feat/logged-in-discovery-redesign`; diff whitespace bersih, index kosong, tidak stage/commit/push |

Suite browser menggunakan backend/media sementara dan fixture foto/tile/geocoding. Karena suite membuat banyak akun dari satu IP, `AuthThrottle.rate` dinaikkan **hanya di script server tes**; batas produksi `30/min` tetap identik. Percobaan awal menemukan selector lama bertabrakan dengan header/dashboard baru dan overflow sidebar mobile; selector diperjelas dan layout diperbaiki sebelum suite55tes diulang penuh hingga lulus. Source API autentikasi tidak dilonggarkan.

Pemeriksaan `playwright-cli` terakhir memakai **fixture layout terisolasi** untuk role/katalog/dashboard, tanpa menulis data kerja. Tile/foto eksternal tetap nyata; request tile yang dibatalkan ketika zoom/navigasi (`ERR_ABORTED`) dibedakan dari kegagalan transfer. Tes integrasi browser dan Django di atas memakai sesi/API/checkout/stok/undo nyata di database sementara. Ini bukan bukti pembayaran uang sungguhan, Nominatim, cloud storage, verifikasi kasir atau deployment publik.

Screenshot final ada di `/tmp/habisin-role-final-{map-desktop,list-desktop,list-mobile,partner-desktop,partner-mobile}.png`; checkout/tiket nyata hasil suite ada di `/tmp/habisin-role-{cart-desktop,cart-mobile,ticket-desktop}.png`. Susunan inti dibandingkan dengan screenshot Pencil. Data aktual, logo existing, opsi tambahan dan keputusan QR pengguna menyebabkan isi tidak identik seluruh piksel dengan contoh desain.

Dependency/lockfile/globalCSS dan util crop/foto tetap identik dengan snapshot125file sebelum revisi di direktori sementara. Keranjang/pending checkout bergantung izin penyimpanan browser; saat tidak tersedia UI menyebut hanya sementara dan pengguna harus menyelesaikan retry sebelum menutup halaman. SQLite membuktikan perilaku transaksi, bukan konkurensi PostgreSQL produksi. Backend tes dihentikan lalu dikembalikan ke database kerja; frontend memakai build produksi, sehingga edit source berikutnya memerlukan rebuild/restart atau dev server.

## Revisi bug listing, peta, keranjang dan pesanan — 24 Oktober 2026

### Perubahan dan keputusan pengguna

- Fokus harga normal/sekarang mengelilingi wrapper penuh termasuk Rp, dengan `focus-within`; outline input internal dilepas.
- Pin peta mengikuti lebar isi (maksimal280px), berpusat pada titik toko dengan hit/focus bounds yang sesuai. Kartu terpilih memiliki padding12px agar foto tidak menutupi garis hijau. Detail dibuka melalui ikon panah kanan tengah, target44px dan label aksesibel.
- Foto keranjang seragam4:3 (desktop96×72/mobile80×60). Tombol hapus keranjang dan hapus favorit berupa ikon sampah merah berbatas; menghapus favorit tidak menghapus listing.
- Mitra dapat membatalkan pesanan miliknya sebelum deadline, termasuk <30menit. Alasan wajib1–500karakter setelah trim. Stok kembali sekali dalam transaksi atomik; retry mempertahankan alasan awal dan mencabut token undo stok. Pembatalan pembeli tetap dibatasi30menit.
- Pesanan kedaluwarsa keluar otomatis dari Aktif, tetap ada di Riwayat pembeli/mitra, serta melepas kunci edit harga/waktu/toko. Riwayat dan tiket dapat dibuka, termasuk alasan mitra. Kedaluwarsa tidak otomatis mengembalikan stok.
- Deadline tiket disalin saat pemesanan; mengubah waktu listing tidak menghidupkan kembali tiket lama. `expired` dihitung pada serializer/UI dari snapshot deadline, sementara status database lama tetap dipertahankan untuk riwayat dan kuota gratis harian. Penghapusan akun mengembalikan stok hanya dari tiket yang masih aktif, agar tiket lama tidak menambah stok batch baru.

### Kontrak API dan migrasi

`POST /api/partner/reservations/{id}/cancel` menerima `{ "reason": "Alasan pembatalan" }`. Respons200 memakai ReservationSerializer;400 untuk alasan tidak valid,403 untuk peran tidak sesuai,404 untuk pesanan toko lain,409 untuk pembatalan baru setelah deadline. Pembatalan ulang tidak menambah stok lagi. Field keluaran additive: `cancellation_note`, `cancelled_by`, `cancelled_at`; status keluaran dapat berupa `reserved`, `cancelled`, `expired`. GET reservations/dashboard mempertahankan data riwayat; UI memisahkan Aktif/Riwayat, sedangkan pengambilan dashboard hanya berisi tiket belum kedaluwarsa.

Migrasi `0011_reservation_lifecycle` menambah metadata pembatalan dan snapshot `pickup_deadline`, lalu mengisi deadline dari listing untuk data lama. Backup SQLite dan snapshot114file dibuat sebelum revisi di direktori sementara privat. Migrasi kerja berhasil. Perbandingan seluruh kolom lama menunjukkan **18tabel/112baris tetap identik**, termasuk **10listing,2toko,8pesanan**; seluruh snapshot deadline lama dan metadata pembatalan kosong juga diperiksa. Tidak ada seed/reset database kerja.

### Hasil verifikasi final

| Pemeriksaan | Hasil aktual |
| --- | --- |
| Django | **84tes lulus**, naik dari76; delapan regresi lifecycle mencakup alasan/trim, ownership/peran, retry stok sekali, undo invalidation, pembatalan <30menit, kedaluwarsa/edit tanpa mengaktifkan ulang tiket, perpindahan toko, kuota gratis, snapshot dan penghapusan akun |
| Browser | **61tes lulus** pada kode final dengan database/media sementara baru; naik dari55 |
| Regresi UI baru |6tes: fokus harga desktop/mobile; label adaptif/seleksi/posisi ikon dan batas klik; foto4:3/trash/favorit; alasan wajib/error503/retry/stok/riwayat mitra dan tiket pembeli; kedaluwarsa otomatis pembeli dan mitra |
| Lint dan TypeScript | `eslint` serta `tsc --noEmit` lulus tanpa peringatan |
| Build | `npm run build -- --webpack` lulus; browser memakai hasil build final |
| Django check dan migration drift | Tidak ada isu; tidak ada migrasi model tertinggal |
| CLI | Desktop1440×900/mobile390×844, pin148px/224px mengikuti isi, tidak overflow; konsol0error/0warning setelah fixture inspeksi dimuat |
| Server lokal |Frontend3000, API melalui3000, dan backend8000 meresponsHTTP200 setelah dikembalikan ke database kerja |
| Git |Branch `feat/logged-in-discovery-redesign` dipertahankan; whitespace diff bersih, index kosong; tidak stage/commit/push |

Percobaan suite awal menghasilkan59/61: satu pemeriksaan marker mendahului inisialisasi Leaflet dan satu pencarian diisi pada header anonim sebelum autentikasi terhidrasi. Tes menunggu marker secara terbatas dan menunggu navigasi pembeli sebelum mengisi pencarian. Suite lengkap diulang hingga61/61, lalu diulang kembali pada backend final setelah perbaikan stok penghapusan akun dan pemeriksaan tiket riwayat pembeli; hasil61/61.

Inspeksi CLI final memakai fixture role/katalog hanya di browser, tanpa menulis database kerja. Pengujian integrasi menggunakan sesi, API, checkout, stok dan pembatalan nyata pada SQLite sementara; foto/tile/geocoding memakai fixture. Respons403 auth/me saat anonim serta pembatalan request tile ketika zoom dibedakan dari error aplikasi. Ini tidak memverifikasi layanan peta/foto eksternal, pembayaran nyata atau konkurensi PostgreSQL. Verifikasi kode/QR tetap tahap berikutnya sesuai keputusan sebelumnya.

Bukti lokal: `/tmp/habisin-bugfix-{django,browser-full,build,lint,tsc,migrate,db-preserved}.log`; screenshot `/tmp/habisin-bugfix-{price-mobile,map-mobile,cart-mobile,cancel-form-mobile,cancel-mobile,cli-map-desktop,cli-map-mobile}.png`. Diff revisi terhadap snapshot disimpan di `/tmp/habisin-bugfix-focused.diff`.

## Perbaikan label di balik popup peta — 24 Oktober 2026

Rencana ringan: bedakan marker pilihan kartu dengan marker yang sedang memiliki popup. Pada tampilan penjelajahan pembeli, marker dengan popup disembunyikan, tidak menerima klik/tab dan diberi aria-hidden. Label kembali ketika kartu lain dipilih, zoom turun dua tingkat dari fokus, Escape, penutupan popup atau seleksi hilang. Fokus keyboard dikembalikan setelah label tampil. Marker lain tetap terlihat. Perubahan terbatas pada FoodMap, CSS marker, dan tes regresi.

Verifikasi singkat sesuai permintaan: **dua tes desktop1440/mobile390 lulus**, ditambah **satu regresi popup anonim/keyboard/filter lulus**; lint komponen/tes dan TypeScript lulus. Playwright CLI menunjukkan hiddenWithPopup=true, restored=true, tanpa overflow dan tanpa error/warning konsol. API memakai fixture browser; database kerja tidak ditulis. Request katalog yang dibatalkan saat reload dibedakan dari error API; sebuah URL foto eksternal existing diblokir ORB pada pemuatan awal sebelum fixture dan tidak menjadi bukti integrasi aset eksternal. Bukti: `/tmp/habisin-popup-{tests,legacy-test,types,cli-check,cli-console,cli-network}.log` dan screenshot `/tmp/habisin-popup-cli-map-{desktop,mobile}.png`. Suite lengkap/build produksi tidak diulang untuk revisi kecil ini.

**Server3000 dan backend8000 dipertahankan hidup dengan PID yang sama**. Karena3000 memakai build produksi sebelumnya, hasil perubahan berjalan melalui **preview dev http://localhost:3001**, terisolasi di `.next/dev`;3000 belum memuat revisi popup ini. Tidak ada restart server existing, migrasi, dependency baru, stage, commit atau push.

## Landing dan Jelajahi publik — 24 Oktober 2026

OpenSpec `landing-page-guest-exploration` mengikuti frame Pencil `OOScE/D8UMfR` (Baris · Landing page, 1440×3903). LandingPage dan CSS Module baru memakai logo/font/card existing: hero, Leaflet Margonda Raya Depok, struk deadline aktual, maksimal empat kartu aktif, langkah pengambilan, band mitra, dampak, FAQ dan footer. Di mobile blok tersusun vertikal tanpa overflow. Atribusi peta berada di kiri atas agar tidak tertutup struk.

Perbedaan faktual dari mockup disengaja: judul memakai “hari ini”, tanggal WIB aktual; section “Makanan di sekitarmu” hanya muncul dari katalog API terverifikasi, stok positif, toko buka dan deadline belum lewat. Tidak ada kartu demo, rating palsu atau angka transaksi terselamatkan. Statistik nasional memakai Bappenas23–48juta ton/tahun periode2000–2019 dan “hampir40%” dari siaran KLH2025 merujuk SIPSN2024, dengan tautan sumber langsung; angka40,16% mockup tidak dipastikan sumber primernya. Tiket H7K49 diberi label CONTOH; QR/verifikasi tetap menyusul. FAQ disesuaikan aturan aplikasi. Tautan footer yang belum mempunyai halaman menjadi teks non-interaktif.

Route `/jelajahi` memakai state dan UI pembeli existing, dengan user nullable. Tamu dapat melihat peta/daftar, mencari, memfilter dan membuka detail/deep link; favorit, keranjang, pesanan serta pembelian berbayar/gratis meminta login tanpa mutasi akun/localStorage. Login mempertahankan detail yang sedang dibuka. CTA mitra meminta login. API/model/migrasi tidak berubah; konfigurasi CSRF DEBUG menambahkan localhost/127.0.0.1:3001 agar login preview berfungsi. Token tetap wajib, origin luar ditolak dan konfigurasi produksi tidak mendapat origin preview.

### Verifikasi aktual

- **24 tes browser lulus (22,6detik)** pada build produksi terisolasi: enam tes landing/tamu baru, popup marker desktop/mobile, map/keyboard/GPS/expiry/ordered refresh/retry, katalog toko/deep link dan styling. Pemilihan file eksplisit menghindari suite integrasi yang menulis DB. Runtime error dan request API gagal dipantau dalam tes landing; semua gate tamu tanpa mutasi terverifikasi.
- **7 tes AuthenticationTests Django lulus**, termasuk CSRF preview tanpa token403, token valid dengan kredensial salah400, dan origin eksternal403. Database tes sementara Django dipakai. Django check dan pemeriksaan migration drift tidak menemukan isu.
- ESLint `src` beserta tes yang berubah dan `tsc --noEmit` lulus. Build `npm run build -- --webpack` lulus dalam salinan sementara, tanpa mengganti `.next` yang dilayani port3000. Regresi timestamp server/client pada build statis diperbaiki dengan suppressHydrationWarning terbatas pada teks waktu; suite produksi final diulang24/24. Tes keyboard menunggu fokus aktual; tes clock memajukan frame fokus sebelum Escape.
- Playwright CLI pada API kerja: Leaflet nyata tampil, tiga kartu aktif pada waktu inspeksi, keranjang tamu meminta login, tidak ada overflow1440px/390px. Empat error konsol merupakan respons auth/me403 yang memang diharapkan untuk tamu, tanpa exception aplikasi; ini tidak membuktikan seluruh layanan foto/peta eksternal selalu tersedia.
- Dependencies/lockfile, konfigurasi Next dan global CSS sama dengan snapshot sebelum tugas. Git diff whitespace bersih, index kosong, branch `feat/logged-in-discovery-redesign` tetap; tidak stage/commit/push. Suite integrasi penuh dan demo.spec tidak dijalankan ulang pada hasil final;24 tes fokus tidak menggantikan seluruh suite.

### Insiden pemilihan tes dan pembersihan

Percobaan awal memakai pola nama `discovery.spec.ts`, yang ikut memilih dua tes integrasi dalam `authenticated-discovery.spec.ts` dan membuat data fixture di DB kerja. Runner langsung dihentikan dan insiden dilaporkan. Setelah backup privat, hanya tiga akun fixture ber-ID5/6/7 (prefix m3_partner/m3_buyer dengan suffix timestamp percobaan), satu listing fixture, tiga toko fixture dan tiga session fixture dihapus; tidak ada reservasi fixture. Perbandingan terhadap backup memastikan seluruh akun/profil/listing/toko/reservasi non-fixture identik. Tersisa4akun,10listing,3toko,9reservasi asli. Tidak melakukan reset/seed DB. Semua tes browser berikutnya memakai file eksplisit dan mock API.

Bukti lokal: `/tmp/habisin-landing-{production-tests,auth-tests,build,lint,types,cli-check,cli-console,cli-network,fixture-cleanup}.log`, diff terhadap snapshot `/tmp/habisin-landing-focused.diff`, screenshot `/tmp/habisin-landing-{1440,390,real-desktop,real-explore-mobile}.png`. Backup sebelum pembersihan fixture: direktori privat `habisin-before-fixture-cleanup-4_m60r62` dalam temporary directory pengguna.

**Preview perubahan: http://localhost:3001, Jelajahi tamu: http://localhost:3001/jelajahi.** Server3000 dan3001 dipertahankan hidup dengan PID yang sama;3000 masih build sebelumnya. Backend8000 tetap melayani; Django autoreload konfigurasi CSRF tanpa penghentian manual server. Server3002 hanya untuk verifikasi build sementara dan dihentikan setelah selesai.


## Pemeriksaan sebelum commit lokal — 24 Oktober 2026

Source yang akan dikomit dipisahkan melalui index sementara dan snapshot lokal; working tree aplikasi tidak diganti. Tiap tahap backend lulus Django check dan pemeriksaan migration drift; tahap frontend lulus TypeScript. Hasil tree akhir dibandingkan byte demi byte dengan seluruh104file source/aset/tes/dokumentasi yang dipilih. Artefak generated dan data pengguna dikecualikan.

Pemeriksaan final: **85tes Django lulus**, **24tes browser fokus lulus**, ESLint source/tes dan TypeScript lulus. Django memakai database tes sementara;24tes browser memakai API fixture eksplisit tanpa checkout/akun baru pada database kerja. Seluruh suite integrasi browser tidak diulang pada giliran commit ini. Build Webpack terisolasi telah lulus untuk source aplikasi yang sama pada revisi logo sebelumnya; setelahnya hanya fixture tes dan dokumentasi berubah.

Dua tes distabilkan sebelum commit: jadwal pickup pada tes dashboard ditetapkan di siang hari WIB sehingga tidak bergantung pada jam eksekusi; tes Escape menunggu fokus heading detail. Percobaan pertama85tes menghasilkan satu kegagalan asumsi waktu dan browser23/24 karena race fokus; sesudah perubahan fixture hasilnya85/85 serta24/24. Mode DEBUG diatur eksplisit untuk proses tes karena environment terminal mewarisi DEBUG=False; konfigurasi produksi tidak diubah untuk menjalankan tes.

Logo memakai PNG transparan terbaru pengguna dengan static import Next Image; tulisan `habisin.` dipertahankan. **Frontend terkini berjalan pada http://localhost:3000**, Jelajahi publik pada `/jelajahi`, dan backend8000 tetap menyala. Preview3001 dan server produksi3000 lama telah digantikan sesuai permintaan pengguna. Catatan port3001 di audit terdahulu merupakan keadaan historis. API katalog/CSRF200 serta validasi login dengan token valid400 telah diperiksa tanpa memakai kredensial pengguna.

Bukti pengujian terbaru: `/tmp/habisin-precommit-{django,browser,lint}.log` dan `/tmp/habisin-commit-state-checks.log`. Tidak ada reset/seed/migrasi pada database kerja untuk membuat commit.
