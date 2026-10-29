"use client";
import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  Gift,
  MapPin,
  ScanLine,
  Search,
  Store,
  Timer,
  Utensils,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
  // The hero's numbers come from the live catalog, not the design's examples.
  const storeInitials = [...new Set(active.map((i) => i.store))]
    .slice(0, 4)
    .map((name) => name.trim()[0]?.toUpperCase() ?? "");
  const bestSaving = active.reduce(
    (best, item) =>
      item.price > 0 && item.original_price > item.price
        ? Math.max(
            best,
            Math.round((1 - item.price / item.original_price) * 100),
          )
        : best,
    0,
  );
  return (
    <div className={`${s.landing} ${designFont.className}`}>
      <section className={`hero ${s.hero}`}>
        <div className={s.heroCopy}>
          <p className={s.eyebrow}>
            <span className={s.dot} aria-hidden="true" />
            Rasa tetap enak. Harga lebih bijak.
          </p>
          <h1>
            Jangan disisain. <br />
            Yuk, <span className={s.underline}>dihabisin</span>.
          </h1>
          <p className={s.lead}>
            Temukan makanan enak di sekitarmu dengan harga lebih hemat.
            Selamatkan rasanya, kurangi sisanya.
          </p>
          <div className={s.actions}>
            <Link href="/jelajahi" className={s.primary}>
              Cari makanan di dekatmu
            </Link>
            <button className={s.textLink} onClick={onPartner}>
              <Store size={18} aria-hidden="true" />
              Punya toko? Jual sisa etalase
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          </div>
          {stores > 0 && (
            <div className={s.proof}>
              <span className={s.avatars} aria-hidden="true">
                {storeInitials.map((letter, index) => (
                  <span key={index}>{letter}</span>
                ))}
              </span>
              <div>
                <p className={s.proofTitle}>
                  {stores} toko di Beji buka hari ini
                </p>
                <p className={s.muted}>
                  Lihat tanpa akun. Masuk cuma saat pesan.
                </p>
              </div>
            </div>
          )}
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
          <p className={s.chip}>
            <Utensils size={18} aria-hidden="true" />
            <span>
              <strong>Masih enak banget!</strong>
              <small>Cuma harganya yang turun.</small>
            </span>
          </p>
          {bestSaving > 0 && (
            <p className={s.sticker}>
              <span>
                Hemat sampai <b>{bestSaving}%</b>
              </span>
              <small>rasa tetap juara</small>
            </p>
          )}
          <aside className={s.receipt} aria-label="Tutup berikutnya">
            <p className={s.eyebrow}>Tutup berikutnya · Beji</p>
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
        <section className={s.nearby} aria-label="Malam ini di sekitar Beji">
          <div className={s.sectionHeading}>
            <div>
              <h2>Malam ini di sekitar Beji</h2>
              <p className={s.muted}>
                Diurutkan dari jam ambil paling dekat · listing aktif saat ini
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
                "Setiap stiker harga menunjukkan jarak, porsi tersisa, dan jam ambil terakhir. Tanpa akun.",
              ],
              [
                "Pesan atau klaim gratis",
                "Bayar (saat ini mode demo), lalu tiket dengan kode 5 karakter terbit. Makanan gratis langsung dapat tiket.",
              ],
              [
                "Tunjukkan kode di kasir",
                "Kasir mengetik atau memindai kodenya. Tiket tetap terbaca walau sinyal hilang.",
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
          <p className={s.eyebrow}>Tiket ambil · Toko Roti Margonda</p>
          <div className={s.exampleCode}>
            <QRCodeSVG
              value="H7K49"
              size={96}
              role="img"
              aria-label="QR contoh H7K · 49"
            />
            <div>
              <small>Kode</small>
              <strong>H7K · 49</strong>
            </div>
          </div>
          <p>Roti Sisir Mentega × 2 · Rp16.000</p>
          <h3>Ambil sebelum 20.30</h3>
          <small>Contoh tampilan · bukan pesanan</small>
        </aside>
      </section>
      <section className={s.partner} id="mitra">
        <div>
          <p className={s.eyebrow}>
            UNTUK MITRA · TOKO ROTI, WARUNG, KAFE, KATERING
          </p>
          <h2>
            Sisa etalase jam tujuh malam jadi pemasukan, bukan kantong sampah.
          </h2>
          <div className={s.features}>
            {[
              {
                Icon: Timer,
                title: "Tayang dalam satu menit",
                body: "Foto, harga, porsi, jam ambil. Atau salin listing kemarin dengan satu ketukan.",
              },
              {
                Icon: ScanLine,
                title: "Verifikasi di kasir dalam lima detik",
                body: "Ketik 5 karakter atau pindai QR. Salah tandai? Ada tombol Urungkan selama 60 detik.",
              },
              {
                Icon: Gift,
                title: "Bisa juga donasi",
                body: "Tandai Gratis untuk makanan yang ingin Anda bagikan. Maks. 2 porsi gratis per orang per hari.",
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
          <div className={s.partnerActions}>
            <button className={s.partnerCta} onClick={onPartner}>
              Daftarkan toko
            </button>
            <p>Gratis untuk mitra. Listing bisa langsung tayang.</p>
          </div>
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
          <p>Huruf otomatis kapital · karakter kelima langsung diperiksa</p>
          <div className={s.verificationNote}>
            <CircleCheck size={20} aria-hidden="true" />
            <div>
              <strong>Kode cocok · Roti Sisir Mentega × 2</strong>
              <p>Atas nama Rani A. · lunas (demo) · ambil sebelum 20.30</p>
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
