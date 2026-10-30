# Riwayat AI Disclosure

Catatan berikut mempertahankan disclosure dan rincian implementasi yang sebelumnya
tercantum di README. Isinya merupakan catatan historis; beberapa perilaku dan nama
branch telah berubah. Untuk ringkasan terkini, lihat [AI Disclosure](../README.md#ai-disclosure).

### Branch: `feat/auth`

Chat link: https://chatgpt.com/s/cx_6aba210934d88191815c9b8c82fb9223

Bantuan AI digunakan untuk:

- **Autentikasi:** registrasi, login/logout, role, sesi persisten, edit profil, ganti password, dan hapus akun.
- **Demo responsif:** katalog makanan, pencarian/filter, peta interaktif, favorit, mock payment, reservasi, tiket pengambilan, dan pembatalan pesanan.
- **Dokumentasi:** penyusunan instruksi setup, prasyarat, konfigurasi environment, seeding demo, perintah pengujian, troubleshooting, dan batasan demo di README ini.

#### Mengisi foto pada Tambah listing

1. Buka **Kelola listing → Tambah listing**, lalu pilih **Toko penjual** (tidak dipilih otomatis). Alamat/pin mengikuti toko itu.
2. Pilih **Upload foto**, pilih JPEG/PNG/WebP, lalu geser foto pada editor 4:3. Gunakan zoom, **Putar 90°**, atau **Reset crop**. Keyboard: fokus area crop lalu tombol panah; slider zoom dapat diubah dengan panah.
3. Pilih **Gunakan foto** untuk preview. **Crop ulang** masih memakai file asli selama form terbuka. **Batal crop**/Escape kembali ke draft tanpa mengganti foto yang sudah dipilih.
4. Alternatifnya pilih **Gunakan URL** dan isi URL publik HTTP/HTTPS. Hanya sumber yang dipilih dikirim. Isi detail lainnya lalu **Tayangkan listing**; saat gagal, draft tetap ada untuk dicoba lagi.
5. Pada edit, tanpa memilih foto baru, foto tersimpan tetap dipakai. File asli tidak disimpan; untuk crop ulang sesudah form ditutup, pilih file asli lagi. Konversikan HEIC menjadi JPEG/PNG sebelum dipilih.

Rollback revisi media/toko: pulihkan frontend dahulu bila perlu. Pertahankan migrasi FK dan kolom file selama masih ada listing upload/beberapa toko; ekspor/cadangkan database dan `MEDIA_ROOT` bersama sebelum rollback backend. Jangan membalik FK owner menjadi satu toko ketika satu akun sudah memiliki beberapa cabang, atau menghapus file yang masih dirujuk riwayat.

### Modul 4: discovery berdasarkan toko

Tampilan **Peta** memakai satu marker per **ID toko**, dihitung dari makanan layak yang lolos filter daftar yang sama. Dua toko bernama sama atau milik mitra yang sama tetap berbeda. Popup menampilkan nama/alamat, perkiraan jarak **garis lurus**, jumlah makanan cocok, harga mulai (termasuk Gratis), pilihan makanan, dan **Lihat toko**. Angka makanan adalah jumlah listing, bukan jumlah porsi.

- Klik marker, atau fokus marker dengan Tab lalu Enter/Spasi. Escape atau **Tutup popup toko** mengembalikan fokus. Di titik yang sama, pilih **Toko lain di lokasi ini**; koordinat tidak digeser untuk memisahkan marker.
- Makanan legacy tanpa relasi toko memakai marker per ID listing dan label **Profil toko belum terhubung**, tanpa tautan toko buatan. Koordinat invalid hanya ditampilkan di daftar dengan penjelasan lokasi.
- Filter tidak mereset pan/zoom. Peta baru dimuat saat pertama dipilih, lalu dipertahankan selama berganti daftar/peta. Jelajahi memakai daftar kiri dan peta kanan pada desktop, bertumpuk pada ponsel.
- **Gunakan lokasi saya** meminta GPS hanya ketika diklik (timeout 10 detik). Kegagalan awal mempertahankan Beji, Depok; setelah pernah berhasil, lokasi valid terakhir dipertahankan. Tidak ada tracking latar belakang, rute perjalanan, atau estimasi waktu tempuh.
- Katalog diperbarui saat fokus kembali, retry, atau mutasi listing/pesanan lokal. Waktu berakhir listing diperiksa oleh timer browser. Perubahan oleh akun lain baru diketahui saat refresh; ini bukan realtime. Server memvalidasi ulang saat memesan.
- Jika API gagal, gunakan **Coba lagi katalog**. Pratinjau contoh atau data terakhir tidak dapat dipesan ketika koneksi gagal. Tile gagal tetap memperlihatkan marker dan atribusi OpenStreetMap; tersedia retry gambar peta serta jalur daftar. Impor library gagal menyediakan retry peta/daftar, tanpa retry tile otomatis berulang.

#### Halaman referensi: katalog profil toko

`GET /api/stores/{id}/listings` mengembalikan array listing publik yang tertaut ke ID tersebut dan layak (aktif, stok positif, belum berakhir, toko aktif). ID toko lain milik owner yang sama tidak ikut. Toko kosong/tutup menghasilkan `200 []`; ID tidak ditemukan `404`. Respons menyertakan foto efektif, `store_id` dan ringkasan toko, tanpa email/owner.

Buka `/stores/{id}` menggunakan ID hasil pendaftaran toko, lalu pilih makanan. Next Link menuju `/?listing={listing_id}` dan membuka alur detail/reservasi beranda yang sama, termasuk saat reload. Parameter dikonsumsi sekali dan dibersihkan saat detail ditutup. ID invalid/tidak tersedia memberi pesan; API offline tidak otomatis membuka makanan demo. Error katalog tidak menghilangkan profil toko yang berhasil dimuat.

Permukaan form listing, popup peta, dan katalog toko memakai font **Plus Jakarta Sans** lokal sesuai token `font-ui` pada design.pen, dengan [lisensi SIL OFL](../frontend/src/fonts/OFL.txt). Warna/radius popup dan form merujuk komponen Pencil; seluruh permukaan memakai palet token global main. Body Jelajahi setelah login mengikuti Dashoard-Login, detail Kartu Makanan (2)/(3), dan Map-makanan dari Pencil. Implementasi tidak mengubah file desain.

Jika build Turbopack di lingkungan terbatas gagal saat membuat proses/binding port, gunakan `npm run build -- --webpack`, lalu `npm run start`. Ini fallback build lokal; jangan menyebut build default berhasil bila hanya Webpack yang diuji. Rangkaian tes discovery mencakup grouping ID, popup/keyboard, GPS, expiry dan pemulihan kegagalan; `map-real.spec.ts` memeriksa toko A/B hingga pesan/batal dengan backend nyata. Gunakan database/media sementara untuk menjalankan seluruh suite browser, agar akun/listing riwayat tes tidak masuk data kerja Anda. Alur geocoding nyata membutuhkan jaringan/provider, atau cache geocoding fixture pada database uji terisolasi.

Panduan menjalankan backend/browser terisolasi, cakupan bukti, dan batas operasional: [Verifikasi Modul 3–4](module-3-4-verification.md).

### Revisi Jelajahi setelah login dan kebijakan reservasi

- Dashboard login: grid 4 kolom desktop, 2 pada tablet, 1 pada ponsel; foto kartu/detail 4:3. Detail login menjadi halaman dua kolom dan tetap mendukung `/?listing=ID`. Body landing dipertahankan; header disatukan melalui SiteHeader.
- Countdown berasal dari `pickup_end`, diperbarui tiap detik; oranye hanya saat sisa waktu **<30 menit**. Waktu dibuat serta metadata penyimpanan tampil dari data mitra; data kosong diberi label jujur.
- Peta login menampilkan daftar kiri 440 px dan peta kanan pada desktop; peta/daftar bertumpuk di ponsel. **Cari di area ini** menyegarkan katalog dan menerapkan bounds tampilan; pan biasa tidak memfilter. Filter lainnya memuat favorit, kategori tambahan, dan batas harga.
- Donasi: maksimal **2 porsi per pembeli per hari WIB lintas seluruh toko**. Pesanan dibatalkan/kedaluwarsa tidak memakai kuota; dua pesanan gratis aktif masing-masing satu porsi diperbolehkan.
- Pesanan **pending** menahan stok maksimal 5 menit dan dapat dibatalkan selama aktif. Sesudah **paid**, pembatalan ditolak mulai **≤30 menit** sebelum deadline. Kedua jenis expiry mengembalikan stok tepat sekali; riwayat tetap tersimpan.
- `GET /api/listings/:id/reservation-policy` memproyeksikan kuota global dan batas maksimal 4 porsi/pesanan (gratis mengikuti sisa kuota). `active_free_reservation_id` selalu null; tidak ada batas satu tiket gratis aktif. Server memvalidasi ulang stok dan izin.
- Data pengguna harus dicadangkan sebelum migrasi `0008_food_preparation_information`. Jangan menjalankan seed atau browser suite terhadap DB kerja.

### Form mitra sesuai Row Tambah listing / Baris 9 desktop

Flow Tambah/Ubah listing memakai app bar dan CTA menetap pada mobile serta sidebar dan pratinjau kartu/peta pada desktop. Pilih cabang secara eksplisit pada **Detail toko & informasi makanan**; di sana tersedia deskripsi, tanggal/jendela pengambilan, waktu dibuat WIB, dan metadata opsional. Upload/URL dan crop 4:3 tetap didukung.

- Nama listing baru/perubahan nama maksimal **60 karakter**. Nama lama tidak dipotong; PATCH yang tidak mengubah nama tetap kompatibel.
- Harga berbayar baru/perubahan harga harus **lebih rendah** dari harga normal; donasi tetap nol. Kuota dan pembatalan sebelumnya tidak berubah.
- `buyer_notes` adalah catatan pembeli opsional maksimal **140 karakter**, diterima pada JSON/multipart dan tampil pada detail. Kategori Kue basah, Sayur & buah, Lainnya ditambah tanpa menghapus kategori lama.
- **Simpan draf** menyimpan isian dan hasil crop secara lokal di browser per akun/create-edit, menggunakan IndexedDB. Ini bukan penyimpanan server atau sinkronisasi perangkat. Pulihkan draf dari banner dan periksa waktu/toko sebelum tayang; publikasi berhasil menghapus draf terkait.
- **Salin dari listing kemarin** membuka daftar listing akun sendiri dengan tanggal nyata, termasuk listing sebelumnya. Foto/nama/harga/porsi/catatan dapat disalin ke isian baru; jam ambil memakai hari ini WIB, waktu dibuat harus diisi ulang. Sumber tidak diubah, jam lewat tidak otomatis digeser ke besok.
- Pengiriman file tetap atomik bersama publikasi. Persentase upload berasal dari bytes transfer sebenarnya; saat respons server ditunggu tampil Memproses. Gagal upload mempertahankan foto dan isian untuk retry.
- Setelah tayang, snackbar **Lihat** membuka detail aktual dan **Tambah listing lain** memulai isian baru. Kembali ke listing membuka inventaris.

### Alur awal pembeli, pesanan dan dashboard mitra

Pembeli masuk ke **Jelajahi → Peta**. Seluruh header atas memakai `SiteHeader` dengan navigasi per peran, logo PNG terbaru dan tulisan `habisin.`; sidebar mitra dipertahankan. Header pembeli memuat pencarian, lokasi, Jelajahi, Favorit, Pesanan saya dan Akun. Pin toko menampilkan nama/rentang harga; klik kartu memfokuskan pin, dua tingkat zoom keluar melepas pilihan.

Integrasi memakai **OrderSummary/OrderList Modul 7**: buat pending → ringkasan/edit catatan/jumlah → pembayaran simulasi → tiket kode teks. Keranjang/batch checkout dan pembatalan mitra ditunda; endpoint `/api/checkout` dan `/api/partner/reservations/:id/cancel` tidak tersedia. Tabel/kolom historisnya tetap dipertahankan. QR/verifikasi kasir saat itu belum tersedia; kini ada di [Modul 8](module-8.md).

Mitra masuk ke dashboard **Baris 10 · Mitra · Dasbor**. Sidebar menyediakan Dasbor, Listing, Pesanan, Profil toko dan Akun; Verifikasi kode kini membuka halaman kasir [Modul 8](module-8.md). `GET /api/partner/dashboard?period=today|week|month|year` hanya membaca data akun sendiri. Widget performa menghitung porsi berbayar, nominal simulasi, dan donasi gratis hanya dari pesanan `picked_up`; grafik memakai waktu pengambilan dalam WIB. Nilai transaksi bukan pembayaran nyata. Kontrak dan cakupan rinci ada di [docs/module-10.md](module-10.md). Listing dan toko tetap memakai CRUD existing. **Tandai habis** mengubah stok nol melalui `POST /api/partner/listings/:id/sold-out`; respons menyertakan token undo 60 detik. `POST /api/partner/listings/:id/undo-sold-out` menerima `token` sekali; perubahan stok atau pembatalan pesanan membatalkan token lama agar tidak menimpa stok terbaru. Refresh dashboard setiap 30 detik/saat fokus/mutasi; keputusan transaksi tetap di server.

Migrasi additive `0010_listingstockaction_checkoutbatch` menambah tabel token checkout/undo. Backup database kerja sebelum migrasi; suite browser harus memakai backend/media sementara pada panduan verifikasi. Tidak ada dependency baru untuk fitur ini.


### Landing publik dan Jelajahi tamu

Beranda publik memakai Leaflet di Margonda Raya, Depok. Section **Makanan di sekitarmu** menampilkan maksimal empat listing aktif dari API dan disembunyikan bila kosong atau katalog belum tersambung. Angka nasional memiliki sumber/periode; angka katalog tidak diklaim sebagai transaksi terselamatkan.

Tamu dapat membuka `/jelajahi`, mencari, memfilter, berpindah peta/daftar dan membaca detail makanan. Pembelian, favorit dan CTA pendaftaran toko meminta login. Footer hanya mengaktifkan halaman atau bagian yang tersedia. Logo terbaru tetap disertai tulisan `habisin.`. QR dan verifikasi kasir kini tersedia di [Modul 8](module-8.md).

### Branch: `feat/pemesanan-dan-mock-payment`

Tools: Claude Code (Anthropic), sesi lokal tanpa tautan chat publik.

Bantuan AI digunakan untuk:

- **Pemesanan (Modul 7):** status pesanan, migrasi data, endpoint ringkasan/edit/mock payment/batal/hapus riwayat, validasi serializer, decorator kepemilikan pesanan, dan rate limiting.
- **Antarmuka:** komponen ringkasan pesanan dan daftar pesanan dengan optimistic update.
- **Pengujian:** unit test backend dan tes browser Playwright yang ditulis lebih dahulu (TDD), serta pengukuran coverage.
- **Perbaikan pendukung:** pembacaan katalog demo sebagai UTF-8 dan pesan 429 berbahasa Indonesia.
- **Dokumentasi:** panduan Modul 7 dan pembaruan README ini.

### Integrasi main dengan Modul 3–4

Lihat [kontrak integrasi dan migrasi](integrate-main-modules-3-4.md).
Migrasi `0012_merge_modules_3_4_and_orders` menyatukan kedua riwayat migrasi secara additive.
Database kerja wajib dicadangkan bersama MEDIA_ROOT sebelum migrasi operasional.
Resolusi merge tidak menjalankan migrasi/seed pada database kerja, membuat commit, atau push. Lihat catatan verifikasi integrasi untuk penyimpangan origin tes dan langkah pembersihan fixture.

### Branch: `feat/modul-8-tiket-dan-verifikasi`

Tools: Claude Code (Anthropic) untuk menulis kode, tes, dan dokumentasi dalam sesi lokal
tanpa tautan chat publik; CodeRabbit sebagai AI reviewer di setiap pull request. Anggota
tim lain memakai Codex (OpenAI) di branch mereka.

**Tujuan.** Menyelesaikan Modul 8 (tiket digital, verifikasi kode kasir, Pindai QR)
dengan TDD yang terlihat di git, lalu memeriksa ulang hasilnya dengan review AI dan
review teman.

**Strategi prompt.**

- Memberi konteks tertulis lebih dulu: berkas serah-terima berisi aturan tim, aturan
  bisnis Modul 7, teks dan state desain Modul 8 dari `design.pen`, dan jebakan yang pernah
  ditemui. AI diminta membaca kode yang ada sebelum menulis.
- Meminta urutan TDD eksplisit: commit `test(...)` yang dibuktikan gagal karena alasan
  yang benar, baru `feat`/`fix` sampai hijau.
- Membatasi ruang ubah: AI hanya mengubah berkas Modul 7–8; berkas teman diubah hanya
  setelah disetujui (tautan Verifikasi kode di dasbor mitra), sisanya ditulis sebagai
  catatan untuk pemiliknya.
- Keputusan produk diambil manusia: HTMX untuk halaman kasir, mempertahankan Pindai QR
  setelah menimbang dependensinya, dan menyimpan htmx/jsQR di repo agar demo tidak
  bergantung pada CDN.

**Bantuan AI digunakan untuk:**

- **Backend:** model `VerificationLog`, view kasir, decorator `@partner_only` dan
  `@partner_owns_reservation`, rate limit 30 cek/menit, serah dan urungkan 60 detik.
- **Halaman kasir (HTMX):** template Django, 5 kotak kode, pintasan keyboard, Pindai QR
  (BarcodeDetector dengan jsQR sebagai cadangan), tema terang/gelap yang sinkron dengan
  aplikasi.
- **Tiket pembeli (React):** halaman tiket, QR, linimasa, sumbu, varian status.
- **Pengujian:** unit test backend dan tes Playwright (termasuk kamera tiruan dan
  pemeriksaan tata letak di 390/760/1440 px).
- **Dokumentasi:** [docs/module-8.md](module-8.md), screenshot, dan bagian ini.

**Keterbatasan AI yang ditemui.**

- Asumsi lingkungan yang keliru: `BarcodeDetector` ternyata tidak ada di Chrome Windows,
  `next-env.d.ts` tidak ikut di CI karena di-gitignore, dan skrip edit di Windows sempat
  mengosongkan berkas karena encoding serta mengubah line ending.
- Bug yang lolos dari tulisan pertama dan baru ditemukan CodeRabbit: Enter di tombol
  "Kode lain" ikut menandai pesanan, kamera tetap menyala bila dialog ditutup saat izin
  kamera masih diminta, dan hasil refresh lama bisa menimpa tiket yang sudah dibatalkan.
- Tes e2e yang gagal karena timeout sempat meninggalkan listing uji di katalog.
- Pemeriksaan visual tetap perlu manusia: tombol tema yang bergeser di 760 px dan nama
  pembeli yang tampil lengkap baru terlihat dari screenshot.

**Perbaikan dan verifikasi manual.**

- Setiap temuan CodeRabbit dicek terhadap kode, diberi tes regresi lebih dulu, lalu
  diperbaiki (lihat commit `test:`/`fix:` di PR #16).
- Pembersihan tes dipindah ke `afterEach`; berkas vendor diberi hash SRI dan
  `.gitattributes`; CI dijalankan ulang setelah perbaikan.
- Alur penuh diperiksa di browser lewat Playwright dan screenshot (desktop, tablet,
  ponsel, tema gelap) sebelum di-commit.
- Violin memutuskan setiap perubahan cakupan, menyetujui perubahan pada berkas teman,
  dan melakukan push sendiri; merge menunggu review teman dan CI.

### Branch: `feat/reviews` — Modul 9

**Tools dan tujuan.** OpenAI Codex digunakan untuk membantu implementasi API dan UI
ulasan produk, agregasi rating toko, pengelolaan ulasan pembeli, serta pengajuan dan
penanganan komplain. Tes Django dan Playwright dipakai untuk memeriksa aturan akses,
status pesanan, dan interaksi UI.

**Strategi prompt dan kendali manusia.**

- Saya memberikan kriteria penerimaan dan batas file khusus Modul 9, lalu meminta
  implementasi, tes, dan dokumentasi dikerjakan bertahap.
- Saya memberikan screenshot referensi dan log kegagalan saat perlu membandingkan UI atau
  mendiagnosis tes.
- Saya menentukan cakupan fitur dan melakukan commit setelah meninjau hasil.

**Keterbatasan AI dan perbaikan manual.**

- Implementasi awal masih memungkinkan ulasan ganda untuk produk yang sama melalui
  pesanan lain. Saya menemukan kasus itu; aturan kelayakan diperketat, batas unik database
  ditambahkan, dan tes regresi dibuat.
- Playwright sempat timeout karena host tes `127.0.0.1` berbeda dari host server
  `localhost`, sehingga permintaan HMR dev diblokir. Saya memeriksa log server dan
  diagnostik tes, lalu menjalankan ulang tes dengan host yang konsisten. Seluruh tes
  review kemudian lolos.

**Verifikasi.** Dokumentasi Modul 9 mencantumkan tes backend `main.test_reviews` dan
`main.test_admin_complaints`, serta Playwright `reviews.spec.ts` dan
`admin-complaints.spec.ts`. Tes browser menggunakan mock API; tes tersebut memeriksa
perilaku UI, bukan isi database produksi.

### Branch: `feat/statistics-dashboard` — Statistik Modul 10

**Tools dan tujuan.** OpenAI Codex membantu membangun API statistik seller dan widget
performa penjualan pada dashboard mitra, lalu menambahkan cakupan tes dan dokumentasi.
UI dikembangkan dari kriteria yang diberikan Raihan, termasuk jumlah porsi, nilai
transaksi, porsi donasi gratis, dan grafik tujuh hari.

**Strategi prompt dan kendali manusia.**

- Saya membatasi pekerjaan ke widget performa dashboard mitra dan meminta kalkulator
  dampak lingkungan diabaikan untuk tahap ini.
- Saya memberikan acuan UI dan mengarahkan pekerjaan secara bertahap: integrasi widget
  ke `/partner`, definisi metrik, jarak antarkomponen, lalu tes.
- Saya menguji hasil dan meminta widget diintegrasikan ke dashboard mitra saat belum
  muncul di halaman `/partner`.

**Keterbatasan AI dan perbaikan manual.**

- Fixture Playwright berisi angka sintetis, bukan data penjualan. Saya memastikan
  agregasi juga diperiksa lewat tes backend dengan database tes.
- Saya memperjelas bahwa porsi terselamatkan hanya menghitung pesanan `picked_up`,
  donasi gratis dihitung terpisah, dan nilai transaksi tetap diberi label simulasi.
- Kalkulator lingkungan belum selesai. Saya meminta agar angka dampak aktual tidak
  diklaim sebelum asumsi berat porsi ditetapkan.

**Verifikasi.** Cakupan tersedia di `main.test_statistics_dashboard` dan
`frontend/tests/partner-statistics.spec.ts`. Dashboard admin yang dikerjakan terpisah
menguji endpoint ringkasan dan antrean di `main.test_admin_complaints` serta
`main.test_workspace_revision`.
