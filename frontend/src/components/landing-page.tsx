"use client";
import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Gift,
  MapPin,
  Search,
  Store,
  Ticket,
} from "lucide-react";
import { type Listing, pickup, rupiah } from "@/lib/api";
import { discover, eligible, type Origin } from "@/lib/discovery";
import { designFont } from "@/lib/design-font";
import HabisinLogo from "./habisin-logo";
import SiteHeader from "./site-header";
import FoodPostCard from "./food-post-card";
import MapBoundary from "./map-boundary";
import s from "./landing-page.module.css";
const FoodMap = dynamic(() => import("./food-map"), {
  ssr: false,
  loading: () => <p role="status">Menyiapkan peta Margonda Raya…</p>,
});
const margonda: Origin = [-6.366, 106.829];

export function PublicSearchParams({
  onQuery,
}: {
  onQuery: (query: string) => void;
}) {
  const query = useSearchParams().get("q") || "";
  useEffect(() => {
    onQuery(query);
  }, [query, onQuery]);
  return null;
}
export function LandingHeader({
  location,
  locating,
  onLocate,
  onLogin,
  onRegister,
}: {
  location: string;
  locating: boolean;
  onLocate: () => void;
  onLogin: () => void;
  onRegister: () => void;
}) {
  return (
    <SiteHeader
      className={`${designFont.className} landing-header compact-header`}
      nav={[
        { label: "Jelajahi", href: "/jelajahi" },
        { label: "Dampak", href: "/#dampak" },
        { label: "Untuk Mitra", href: "/#mitra" },
      ]}
      actions={
        <button className="header-login-desktop" onClick={onLogin}>
          Masuk
        </button>
      }
      end={
        <>
          <button className="header-login-mobile" onClick={onLogin}>
            Masuk
          </button>
          <button
            className={s.primary}
            aria-label="Daftar gratis"
            onClick={onRegister}
          >
            Daftar<span className="header-signup-long"> gratis</span>
          </button>
        </>
      }
    >
      <form action="/jelajahi" className={s.search} role="search">
        <Search size={18} aria-hidden="true" />
        <input
          name="q"
          aria-label="Cari makanan atau toko"
          placeholder="Cari roti, nasi, atau nama toko"
        />
      </form>
      <button
        className={`${s.location} header-location`}
        aria-label={locating ? "Mencari lokasi…" : `${location} · Ubah lokasi`}
        title={location}
        onClick={onLocate}
        disabled={locating}
      >
        <MapPin size={16} />
        <span className="header-location-text">
          {locating ? "Mencari lokasi…" : location}
        </span>
      </button>
    </SiteHeader>
  );
}
export default function LandingPage({
  items,
  now,
  origin,
  online,
  verified,
  loading,
  onRefresh,
  onSelect,
  onSave,
  onPartner,
  onLogin,
  onRegister,
}: {
  items: Listing[];
  now: number;
  origin: Origin;
  online: boolean;
  verified: boolean;
  loading: boolean;
  onRefresh: () => void;
  onSelect: (item: Listing) => void;
  onSave: () => void;
  onPartner: () => void;
  onLogin: () => void;
  onRegister: () => void;
}) {
  const router = useRouter();
  const active = useMemo(
    () =>
      online && verified
        ? items
            .filter((i) => eligible(i, now))
            .sort((a, b) => Date.parse(a.pickup_end) - Date.parse(b.pickup_end))
        : [],
    [items, now, online, verified],
  );
  const { storeGroups } = useMemo(
    () =>
      discover(
        active,
        {
          query: "",
          category: "Semua",
          free: false,
          maxPrice: Infinity,
          savedOnly: false,
          saved: [],
          sort: "pickup",
        },
        margonda,
        now,
      ),
    [active, now],
  );
  const stores = new Set(active.map((i) => i.store_id ?? `legacy:${i.store}`))
    .size;
  const portions = active.reduce((total, item) => total + item.stock, 0);
  const stamp = new Date(now).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className={`${s.landing} ${designFont.className}`}>
      <section className={`hero ${s.hero}`}>
        <div className={s.heroCopy}>
          <p className={s.eyebrow} suppressHydrationWarning>
            {stamp} WIB ·{" "}
            {online && verified
              ? `${stores} toko sedang menayangkan makanan`
              : "Makanan surplus di Depok"}
          </p>
          <h1>
            Roti, nasi, dan kue yang tersisa hari ini. Ambil sebelum toko tutup,
            bayar lebih murah.
          </h1>
          <p className={s.lead}>
            HABISIN menunjukkan makanan surplus dari toko roti, warung, dan kafe
            di sekitar Anda di Depok — dengan harga lebih hemat atau gratis —
            lengkap dengan jam ambil terakhirnya.
          </p>
          <div className={s.actions}>
            <Link href="/jelajahi" className={s.primary}>
              Lihat makanan di sekitar saya <ArrowRight size={18} />
            </Link>
            <button className={s.secondary} onClick={onPartner}>
              <Store size={20} />
              Saya pemilik toko
            </button>
          </div>
          <p className={s.muted}>
            Tanpa akun untuk melihat. Masuk saat ingin memesan, menyimpan
            favorit, dan melihat pesanan.
          </p>
        </div>
        <div className={s.board} aria-label="Papan makanan hari ini">
          <div className={s.mapPanel}>
            <MapBoundary
              onFallback={() => {
                router.push("/jelajahi");
              }}
            >
              <FoodMap
                groups={storeGroups}
                origin={margonda}
                now={now}
                visible
                recenterKey={0}
                onSelect={onSelect}
                onFallback={() => {
                  router.push("/jelajahi");
                }}
                onReset={onRefresh}
                appearance="landing"
              />
            </MapBoundary>
          </div>
          <aside className={s.receipt} aria-label="Batas ambil terdekat">
            <p className={s.eyebrow}>AMBIL SEBELUM · DEPOK</p>
            {active.slice(0, 4).map((item) => (
              <button
                className={s.receiptRow}
                key={item.id}
                onClick={() => onSelect(item)}
              >
                <time dateTime={item.pickup_end}>
                  {pickup(item.pickup_end)}
                </time>
                <span>{item.name}</span>
                <strong>{rupiah(item.price)}</strong>
              </button>
            ))}
            {!active.length && (
              <p role="status">
                {loading
                  ? "Memuat makanan yang sedang tersedia…"
                  : online
                    ? "Belum ada listing aktif saat ini."
                    : "Katalog belum terhubung."}
              </p>
            )}
            {!online && !loading && (
              <button className={s.textLink} onClick={onRefresh}>
                Coba lagi katalog
              </button>
            )}
            <small>Listing aktual · waktu pengambilan WIB</small>
          </aside>
        </div>
      </section>
      {active.length > 0 && (
        <section className={s.nearby} aria-label="Makanan di sekitarmu">
          <div className={s.sectionHeading}>
            <div>
              <h2>Makanan di sekitarmu</h2>
              <p className={s.muted}>
                Diurutkan dari batas ambil terdekat · listing aktif saat ini
              </p>
            </div>
            <Link href="/jelajahi" className={s.textLink}>
              Lihat semua di peta <ArrowRight size={18} />
            </Link>
          </div>
          <div className={s.cards}>
            {active.slice(0, 4).map((item) => (
              <FoodPostCard
                key={item.id}
                item={item}
                now={now}
                origin={origin}
                saved={false}
                onSave={onSave}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      )}
      <section className={s.how} id="cara-ambil" aria-labelledby="how-heading">
        <div>
          <h2 id="how-heading">Dari peta ke kasir dalam tiga langkah</h2>
          <ol className={s.steps}>
            {[
              [
                "Pilih di peta atau daftar",
                "Lihat harga, porsi tersisa, lokasi, dan jam ambil terakhir. Anda bisa menjelajah tanpa akun.",
              ],
              [
                "Pesan atau klaim gratis",
                "Masuk sebagai pembeli, lalu pesan dengan pembayaran simulasi. Setiap makanan mendapat tiket dengan kode 5 karakter.",
              ],
              [
                "Tunjukkan kode saat mengambil",
                "Datang sebelum batas ambil dan tunjukkan tiket kepada kasir. Kasir mencocokkan kode atau memindai QR tiket untuk memverifikasi pengambilan pesanan.",
              ],
            ].map(([title, body], index) => (
              <li key={title}>
                <span className={s.stepNumber}>{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p className={s.muted}>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <aside className={s.exampleTicket} aria-label="Contoh tiket">
          <p className={s.eyebrow}>CONTOH TIKET · BUKAN PESANAN</p>
          <div className={s.exampleCode}>
            <Ticket size={58} strokeWidth={1.2} />
            <div>
              <small>Kode contoh</small>
              <strong>H7K · 49</strong>
            </div>
          </div>
          <p>Roti Sisir Mentega × 2 · Rp16.000</p>
          <h3>Ambil sebelum 20.30</h3>
          <small>Ilustrasi tampilan · QR menyusul</small>
        </aside>
      </section>
      <section className={s.partner} id="mitra">
        <div>
          <p className={s.eyebrow}>
            UNTUK MITRA · TOKO ROTI, WARUNG, KAFE, KATERING
          </p>
          <h2>Sisa etalase jadi pemasukan, bukan kantong sampah.</h2>
          <div className={s.features}>
            {[
              {
                Icon: Camera,
                title: "Siapkan listing makanan",
                body: "Unggah foto atau gunakan URL, isi harga, porsi, dan jam ambil. Pilih toko yang menjualnya atau salin listing sebelumnya.",
              },
              {
                Icon: Ticket,
                title: "Kode untuk setiap pesanan",
                body: "Pembeli mendapat tiket dengan kode dan QR. Kasir mencocokkan kode atau memindai QR untuk memverifikasi pengambilan.",
              },
              {
                Icon: Gift,
                title: "Bisa juga donasi",
                body: "Tandai Gratis untuk berbagi. Maksimal 2 porsi gratis per pembeli per hari WIB untuk seluruh toko.",
              },
            ].map(({ Icon, title, body }) => (
              <div key={title}>
                <Icon size={24} />
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
          <button className={s.partnerCta} onClick={onPartner}>
            Daftarkan toko <ArrowRight size={18} />
          </button>
        </div>
        <div
          className={s.verificationExample}
          aria-label="Ilustrasi verifikasi kode"
        >
          <h3>Verifikasi kode</h3>
          <div className={s.codeBoxes} aria-label="Kode contoh H7K49">
            {"H7K49".split("").map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <p>Kode 5 karakter dari tiket pembeli</p>
          <div className={s.verificationNote}>
            <Ticket size={20} />
            <div>
              <strong>Ilustrasi alur pengambilan</strong>
              <p>
                Kasir mencocokkan kode atau memindai QR tiket sebelum menyerahkan pesanan. Pembayaran saat ini masih simulasi.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className={s.impact} id="dampak">
        <h2>Kenapa ini penting di Indonesia</h2>
        <div className={s.figures}>
          <div>
            <strong>23–48 juta ton</strong>
            <p>
              perkiraan food loss dan waste per tahun di Indonesia, periode
              2000–2019.
            </p>
            <a
              href="https://greeneconomy.bappenas.go.id/home/bappenas-jabarkan-pentingnya-kelola-food-loss-and-waste-untuk-pembangunan-rendah-karbon-dan-ekonomi-sirkular/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Sumber: Bappenas, kajian 2021 ↗
            </a>
          </div>
          <div>
            <strong>Hampir 40%</strong>
            <p>sampah pada data SIPSN 2024 merupakan sisa makanan.</p>
            <a
              href="https://kemenlh.go.id/news/detail/klhbplh-luncurkan-kebijakan-pemanfaatan-sampah-organik-untuk-pupuk-organik-dorong-swasembada-pangan-berkelanjutan"
              target="_blank"
              rel="noopener noreferrer"
            >
              Sumber: KLH, 9 September 2025 ↗
            </a>
          </div>
          <div className={s.liveFigures}>
            <h3>Katalog HABISIN saat ini</h3>
            <p>
              <b>{active.length}</b> listing aktif
            </p>
            <p>
              <b>{portions}</b> porsi tersedia
            </p>
            <p>
              <b>{stores}</b> toko menayangkan
            </p>
            <small>
              {online && verified
                ? "Data listing aktual · bukan jumlah pengambilan selesai"
                : "Katalog belum terverifikasi; angka belum tersedia"}
            </small>
          </div>
        </div>
      </section>
      <section className={s.faq} id="faq">
        <h2>Pertanyaan yang sering muncul</h2>
        <div>
          {[
            [
              "Apakah makanannya masih layak?",
              "Makanan surplus adalah makanan berlebih dari mitra. Periksa waktu dibuat, penyimpanan, dan alergen yang dicantumkan. Konfirmasikan kondisi makanan kepada toko sebelum mengambil.",
            ],
            [
              "Bagaimana kalau saya telat mengambil?",
              "Tiket kedaluwarsa pada batas ambil dan masuk ke Riwayat. Pembeli dapat membatalkan hingga 30 menit sebelum batas ambil. Hubungi toko bila ada kendala pengambilan.",
            ],
            [
              "Bagaimana cara bayarnya?",
              "Saat ini pembayaran HABISIN berupa simulasi. Tidak ada uang yang ditarik. Masuk terlebih dahulu untuk memesan makanan dan melihat pesanan.",
            ],
            [
              "Kenapa ada makanan gratis?",
              "Sebagian toko mendonasikan sisa jualannya. Kuotanya maksimal 2 porsi gratis per pembeli per hari WIB untuk seluruh toko. Pesanan dibatalkan atau kedaluwarsa tidak memakai kuota.",
            ],
          ].map(([question, answer]) => (
            <article key={question}>
              <h3>{question}</h3>
              <p className={s.muted}>{answer}</p>
            </article>
          ))}
        </div>
      </section>
      <footer className={s.footer}>
        <div>
          <HabisinLogo />
          <p>Makanan surplus dari toko di sekitar Depok, sebelum toko tutup.</p>
        </div>
        <nav aria-label="Footer pembeli">
          <h3>Pembeli</h3>
          <Link href="/jelajahi">Jelajahi</Link>
          <a href="#dampak">Dampak</a>
          <button onClick={onLogin}>Masuk</button>
          <button onClick={onRegister}>Daftar gratis</button>
        </nav>
        <nav aria-label="Footer mitra">
          <h3>Mitra</h3>
          <a href="#mitra">Untuk Mitra</a>
          <button onClick={onPartner}>Daftarkan toko</button>
          <span>Panduan foto listing</span>
        </nav>
        <nav aria-label="Footer bantuan">
          <h3>Bantuan</h3>
          <a href="#faq">Pertanyaan umum</a>
          <span>Laporkan listing</span>
          <span>Kebijakan privasi</span>
        </nav>
      </footer>
      <div className={s.footerBottom}>
        <span>© {new Date(now).getFullYear()} HABISIN · Depok</span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          Data peta © OpenStreetMap contributors
        </a>
      </div>
    </div>
  );
}
