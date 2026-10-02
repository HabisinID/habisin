"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Compass,
  Heart,
  Leaf,
  LocateFixed,
  LogOut,
  Map,
  MapPin,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sprout,
  Ticket,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { Auth, Profile } from "@/components/account";
import Modal from "@/components/modal";
import {
  api,
  distance,
  pickup,
  rupiah,
  type Listing,
  type Reservation,
  type User,
} from "@/lib/api";
import demo from "@/lib/demo.json";

const FoodMap = dynamic(() => import("@/components/food-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">Menyiapkan peta di sekitarmu…</div>
  ),
});
function subscribeFavorites(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("habisin-favorites", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("habisin-favorites", callback);
  };
}
function readFavorites() {
  try {
    return localStorage.getItem("habisin-saved") || "[]";
  } catch {
    return "[]";
  }
}
const categories = ["Semua", "Makanan berat", "Roti & kue", "Camilan", "Sehat"];
const defaultOrigin: [number, number] = [-6.366, 106.829];
type Panel =
  | "login"
  | "register"
  | "profile"
  | "orders"
  | "how"
  | "impact"
  | "partner"
  | null;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Listing[]>(demo);
  const [online, setOnline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [registrationRole, setRegistrationRole] = useState<"buyer" | "partner">(
    "buyer",
  );
  const [selected, setSelected] = useState<Listing | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const [free, setFree] = useState(false);
  const [maxPrice, setMaxPrice] = useState(60000);
  const [filters, setFilters] = useState(false);
  const [view, setView] = useState("list");
  const [sort, setSort] = useState("near");
  const [origin, setOrigin] = useState<[number, number]>(defaultOrigin);
  const [location, setLocation] = useState("Beji, Depok");
  const [locating, setLocating] = useState(false);
  const favoritesSnapshot = useSyncExternalStore(
    subscribeFavorites,
    readFavorites,
    () => "[]",
  );
  const saved = useMemo<number[]>(() => {
    try {
      const data = JSON.parse(favoritesSnapshot);
      return Array.isArray(data)
        ? data.filter((v: unknown) => typeof v === "number")
        : [];
    } catch {
      return [];
    }
  }, [favoritesSnapshot]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [orders, setOrders] = useState<Reservation[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [ticket, setTicket] = useState<Reservation | null>(null);
  const [dashboard, setDashboard] = useState<{
    users: number | null;
    listings: number;
    message: string;
  } | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  useEffect(() => {
    api<User>("auth/me")
      .then(setUser)
      .catch(() => {});
    api<Listing[]>("listings")
      .then((data) => {
        setItems(data);
        setOnline(true);
      })
      .catch(() => setOnline(false))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const visible = useMemo(
    () =>
      items
        .filter(
          (item) =>
            (!query ||
              `${item.name} ${item.store}`
                .toLowerCase()
                .includes(query.toLowerCase())) &&
            (category === "Semua" || item.category === category) &&
            (!free || item.price === 0) &&
            item.price <= maxPrice &&
            (!savedOnly || saved.includes(item.id)),
        )
        .sort((a, b) =>
          sort === "price"
            ? a.price - b.price
            : distance(a.latitude, a.longitude, origin) -
              distance(b.latitude, b.longitude, origin),
        ),
    [items, query, category, free, maxPrice, savedOnly, saved, sort, origin],
  );
  const selectItem = useCallback((item: Listing) => {
    setQuantity(1);
    setOrderError("");
    setSelected(item);
  }, []);
  function toggleSaved(id: number) {
    const next = saved.includes(id)
      ? saved.filter((value) => value !== id)
      : [...saved, id];
    try {
      localStorage.setItem("habisin-saved", JSON.stringify(next));
      window.dispatchEvent(new Event("habisin-favorites"));
    } catch {
      setNotice("Penyimpanan favorit tidak tersedia di browser ini.");
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setNotice("Browser ini belum mendukung lokasi.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin([position.coords.latitude, position.coords.longitude]);
        setLocation("Lokasi kamu");
        setLocating(false);
      },
      () => {
        setNotice("Lokasi tidak tersedia. Pencarian tetap di Beji, Depok.");
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }
  async function showOrders() {
    if (!user) {
      setPanel("login");
      return;
    }
    setPanel("orders");
    setOrdersLoading(true);
    setOrderError("");
    try {
      setOrders(await api<Reservation[]>("reservations"));
    } catch (e) {
      setOrderError((e as Error).message);
    } finally {
      setOrdersLoading(false);
    }
  }
  async function book() {
    if (!user) {
      setSelected(null);
      setPanel("login");
      setNotice("Masuk terlebih dahulu untuk menyelamatkan makanan.");
      return;
    }
    setBusy(true);
    setOrderError("");
    try {
      const order = await api<Reservation>("reservations", "POST", {
        listing_id: selected!.id,
        quantity,
      });
      setTicket(order);
      setSelected(null);
      setItems((current) =>
        current.map((item) =>
          item.id === order.listing.id
            ? { ...item, stock: order.listing.stock }
            : item,
        ),
      );
    } catch (e) {
      setOrderError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(order: Reservation) {
    setBusy(true);
    setOrderError("");
    try {
      const updated = await api<Reservation>(
        `reservations/${order.id}/cancel`,
        "POST",
      );
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setItems((current) =>
        current.map((item) =>
          item.id === updated.listing.id ? updated.listing : item,
        ),
      );
      setNotice("Pesanan dibatalkan. Stok sudah dikembalikan.");
    } catch (e) {
      setOrderError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    try {
      await api("auth/logout", "POST");
      setUser(null);
      setOrders([]);
      setDashboard(null);
      setNotice("Kamu berhasil keluar.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function openPartner() {
    setDashboardError("");
    setPanel("partner");
    if (user && user.role !== "buyer")
      api<{ users: number | null; listings: number; message: string }>(
        "dashboard",
      )
        .then(setDashboard)
        .catch((e) => setDashboardError(e.message));
  }
  function resetFilters() {
    setQuery("");
    setCategory("Semua");
    setFree(false);
    setMaxPrice(60000);
    setSavedOnly(false);
  }

  return (
    <>
      <div className="announcement">
        <Leaf size={13} />
        <span>Makanan baik layak mendapat kesempatan kedua.</span>
        <span className="announcement-link">
          Yuk, mulai dari piringmu <ArrowUpRight size={13} />
        </span>
      </div>
      <header className="header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="Habisin beranda">
            <span className="brand-icon">
              <Sprout size={25} strokeWidth={2.5} />
            </span>
            habisin<span className="brand-dot">.</span>
          </Link>
          <nav aria-label="Navigasi utama">
            <a className="nav-active" href="#explore">
              Jelajahi
            </a>
            <button onClick={() => setPanel("how")}>Cara kerja</button>
            <button onClick={() => setPanel("impact")}>
              Dampak kita <span className="tiny-dot" />
            </button>
          </nav>
          <div className="header-actions">
            <button className="partner-link" onClick={openPartner}>
              {user?.role === "admin"
                ? "Dasbor admin"
                : user?.role === "partner"
                  ? "Dasbor mitra"
                  : "Jadi mitra"}
              <ArrowUpRight size={15} />
            </button>
            <span className="header-divider" />
            {user ? (
              <>
                <button
                  className="account-button"
                  onClick={() => setPanel("profile")}
                >
                  <span className="avatar small">
                    {(user.name || user.username)[0].toUpperCase()}
                  </span>
                  <span>{user.name.split(" ")[0] || user.username}</span>
                </button>
                <button
                  className="icon-button"
                  onClick={signOut}
                  aria-label="Keluar"
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <button
                  className="login-link"
                  onClick={() => setPanel("login")}
                >
                  Masuk
                </button>
                <button
                  className="button primary signup"
                  onClick={() => {
                    setRegistrationRole("buyer");
                    setPanel("register");
                  }}
                >
                  Daftar gratis
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" /> RASA TETAP ENAK. HARGA LEBIH
              BIJAK.
            </div>
            <h1>
              Jangan disisain.
              <br />
              Yuk,{" "}
              <span>
                dihabisin
                <svg viewBox="0 0 310 15" aria-hidden="true">
                  <path d="M4 10 Q140 -2 306 8" />
                </svg>
              </span>
              .
            </h1>
            <p>
              Temukan makanan enak di sekitarmu dengan harga
              <br className="desktop-break" /> lebih hemat. Selamatkan rasanya,
              kurangi sisanya.
            </p>
            <div className="hero-actions">
              <a href="#explore" className="button primary hero-cta">
                Cari makanan di dekatmu
                <ArrowDown size={17} />
              </a>
              <span className="hero-note">
                <Leaf size={17} /> Baik buat kamu & bumi.
              </span>
            </div>
            <div className="social-proof">
              <div className="people">
                <span>R</span>
                <span>A</span>
                <span>N</span>
                <span>D</span>
              </div>
              <div>
                <strong>Satu porsi, banyak arti.</strong>
                <small>Jadi bagian dari gerakan baik ini.</small>
              </div>
            </div>
          </div>
          <div className="hero-art">
            <div className="hero-circle" />
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="floating-star star-one">✳</span>
            <span className="floating-star star-two">✳</span>
            <div
              className="hero-image"
              role="img"
              aria-label="Semangkuk makanan segar dengan sayuran berwarna-warni"
            />
            <div className="food-tag">
              <span className="tag-icon">
                <Utensils size={19} />
              </span>
              <div>
                <strong>Masih enak banget!</strong>
                <small>Cuma harganya yang berkurang.</small>
              </div>
              <span>✦</span>
            </div>
            <div className="discount-tag">
              <span>HEMAT SAMPAI</span>
              <strong>
                70<small>%</small>
              </strong>
              <span>rasa 100% juara</span>
            </div>
            <div className="earth-tag">
              <span>
                <Leaf size={16} />
              </span>
              Less waste, more taste.
            </div>
            <span className="art-caption">GOOD FOOD. SECOND CHANCE.</span>
          </div>
        </section>
        <section className="benefits wrap" aria-label="Keuntungan Habisin">
          <div>
            <span className="benefit-icon">
              <ShoppingBag size={20} />
            </span>
            <p>
              <strong>Enaknya dapat, hematnya juga.</strong>
              <small>Makanan favorit, diskon hingga 70%</small>
            </p>
          </div>
          <div>
            <span className="benefit-icon">
              <Leaf size={21} />
            </span>
            <p>
              <strong>Aksi kecil, dampak besar.</strong>
              <small>Kurangi makanan terbuang setiap hari</small>
            </p>
          </div>
          <div>
            <span className="benefit-icon">
              <Heart size={21} />
            </span>
            <p>
              <strong>Berbagi itu bikin kenyang.</strong>
              <small>Temukan donasi makanan di sekitarmu</small>
            </p>
          </div>
        </section>

        <section className="explore wrap" id="explore">
          <div className="section-top">
            <div>
              <div className="eyebrow section-eyebrow">
                TEMUKAN FAVORIT BARUMU
              </div>
              <h2>
                Yang enak di dekatmu<span>.</span>
              </h2>
              <p>Makanan hari ini. Kesempatan baik untuk kamu.</p>
            </div>
            <button
              className="location-button"
              onClick={locate}
              disabled={locating}
            >
              <MapPin size={18} />
              <span>
                <small>Lokasi pencarian</small>
                <strong>{locating ? "Mencari lokasi…" : location}</strong>
              </span>
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="search-row">
            <div className="search-box">
              <Search size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Lagi pengin makan apa? Cari makanan atau toko…"
                aria-label="Cari makanan atau toko"
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="Hapus pencarian"
                  onClick={() => setQuery("")}
                >
                  <X size={17} />
                </button>
              )}
            </div>
            <button
              className={`button filter-button ${filters ? "selected" : ""}`}
              onClick={() => setFilters(!filters)}
              aria-expanded={filters}
            >
              <SlidersHorizontal size={18} />
              Filter{maxPrice < 60000 && <span className="tiny-dot" />}
            </button>
            <div className="view-toggle" aria-label="Tampilan makanan">
              <button
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
              >
                <Utensils size={16} />
                Daftar
              </button>
              <button
                className={view === "map" ? "active" : ""}
                onClick={() => setView("map")}
                aria-pressed={view === "map"}
              >
                <Map size={17} />
                Peta
              </button>
            </div>
          </div>
          {filters && (
            <div className="filter-panel">
              <label>
                Harga maksimal <strong>{rupiah(maxPrice)}</strong>
                <input
                  type="range"
                  min="0"
                  max="60000"
                  step="5000"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                />
              </label>
              <button
                className={`chip ${savedOnly ? "active" : ""}`}
                onClick={() => setSavedOnly(!savedOnly)}
              >
                <Heart size={16} />
                Favorit saya
              </button>
              <button className="text-button" onClick={resetFilters}>
                Reset filter
              </button>
            </div>
          )}
          <div className="category-row">
            <div className="category-tabs">
              {categories.map((item, index) => (
                <button
                  className={`chip ${category === item ? "active" : ""}`}
                  key={item}
                  onClick={() => setCategory(item)}
                >
                  <span aria-hidden="true">
                    {["✦", "🍛", "🥐", "🍩", "🥗"][index]}
                  </span>
                  {item}
                </button>
              ))}
            </div>
            <label className="donation-toggle">
              <input
                type="checkbox"
                checked={free}
                onChange={(e) => setFree(e.target.checked)}
              />
              <span className="switch" />
              <Heart size={15} />
              Donasi gratis
            </label>
          </div>
          <div className="results-meta">
            <p>
              <strong>{visible.length} pilihan lezat</strong> untuk diselamatkan{" "}
              <span className="demo-badge">Katalog demo</span>
            </p>
            <label>
              Urutkan:{" "}
              <select
                aria-label="Urutkan makanan"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="near">Terdekat</option>
                <option value="price">Harga terendah</option>
              </select>
            </label>
          </div>
          {loaded && !online && (
            <div className="offline-note" role="status">
              Kamu sedang melihat pratinjau demo. Jalankan backend untuk masuk
              dan memesan.
            </div>
          )}
          {visible.length === 0 ? (
            <div className="empty-state">
              <Search size={32} />
              <h3>Belum ada yang cocok.</h3>
              <p>Coba kata kunci lain atau ubah filter pencarianmu.</p>
              <button className="button primary" onClick={resetFilters}>
                Lihat semua makanan
              </button>
            </div>
          ) : view === "map" ? (
            <div className="map-view">
              <FoodMap items={visible} origin={origin} onSelect={selectItem} />
              <div className="map-help">
                <MapPin size={15} />
                Pilih harga di peta untuk melihat makanan.
                <button onClick={locate} aria-label="Gunakan lokasi saya">
                  <LocateFixed size={19} />
                </button>
              </div>
            </div>
          ) : (
            <div className="food-grid">
              {visible.map((item) => (
                <article className="food-card" key={item.id}>
                  <div className="card-image-wrap">
                    <button
                      className="image-button"
                      onClick={() => selectItem(item)}
                      aria-label={`Lihat ${item.name}`}
                    >
                      <div
                        className="card-image"
                        style={{ backgroundImage: `url("${item.image}")` }}
                      />
                    </button>
                    <span
                      className={`discount-badge ${item.price === 0 ? "donation" : ""}`}
                    >
                      {item.price === 0 ? (
                        <>
                          <Heart size={12} /> Berbagi gratis
                        </>
                      ) : (
                        `Hemat ${Math.round((1 - item.price / item.original_price) * 100)}%`
                      )}
                    </span>
                    <button
                      className={`favorite ${saved.includes(item.id) ? "is-saved" : ""}`}
                      onClick={() => toggleSaved(item.id)}
                      aria-label={`${saved.includes(item.id) ? "Hapus" : "Simpan"} ${item.name} ${saved.includes(item.id) ? "dari" : "ke"} favorit`}
                      aria-pressed={saved.includes(item.id)}
                    >
                      <Heart
                        size={18}
                        fill={saved.includes(item.id) ? "currentColor" : "none"}
                      />
                    </button>
                    <span className="stock-badge">
                      <span />
                      {item.stock > 0
                        ? `Sisa ${item.stock} porsi`
                        : "Sudah habis"}
                    </span>
                  </div>
                  <div className="card-content">
                    <div className="store-line">
                      <span>{item.store}</span>
                      <span>
                        <MapPin size={12} />
                        {distance(
                          item.latitude,
                          item.longitude,
                          origin,
                        ).toFixed(1)}{" "}
                        km
                      </span>
                    </div>
                    <button
                      className="card-title"
                      onClick={() => selectItem(item)}
                    >
                      {item.name}
                    </button>
                    <div className="pickup">
                      <Clock3 size={13} />
                      Ambil{" "}
                      {online
                        ? `${pickup(item.pickup_start)}–${pickup(item.pickup_end)}`
                        : "17.00–21.00"}{" "}
                      WIB
                    </div>
                    <div className="card-bottom">
                      <div>
                        <span
                          className={`price ${item.price === 0 ? "free" : ""}`}
                        >
                          {rupiah(item.price)}
                        </span>
                        <span className="old-price">
                          {rupiah(item.original_price)}
                        </span>
                      </div>
                      <button
                        className="card-arrow"
                        aria-label={`Pesan ${item.name}`}
                        onClick={() => selectItem(item)}
                      >
                        <ArrowUpRight size={20} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="catalog-foot">
            <span>
              <Check size={15} /> Dibuat hari ini, dinikmati hari ini.
            </span>
            <button className="text-button" onClick={showOrders}>
              Pesanan saya <Ticket size={17} />
            </button>
          </div>
        </section>
        <section className="join-banner wrap">
          <div className="join-illustration">
            <Sprout size={58} strokeWidth={1.4} />
            <span>✦</span>
          </div>
          <div>
            <div className="eyebrow">PUNYA USAHA MAKANAN?</div>
            <h2>Sisa hari ini, peluang baru.</h2>
            <p>Jangkau pelanggan baru dan ubah makanan berlebih jadi berkah.</p>
          </div>
          <button className="button primary" onClick={openPartner}>
            Kenalan jadi mitra
            <ArrowUpRight size={18} />
          </button>
        </section>
        <footer className="wrap">
          <Link className="brand" href="/">
            habisin<span className="brand-dot">.</span>
          </Link>
          <span>Save food. Cut waste. Feed communities.</span>
          <p>
            Proyek demo · Kelompok 10 PBP B <Leaf size={14} />
          </p>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          <Leaf size={18} />
          {notice}
          <button aria-label="Tutup notifikasi" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {(panel === "login" || panel === "register") && (
        <Auth
          initial={panel}
          initialRole={registrationRole}
          onClose={() => setPanel(null)}
          onUser={(newUser) => {
            setUser(newUser);
            setNotice(`Selamat datang, ${newUser.name}!`);
          }}
        />
      )}
      {panel === "profile" && user && (
        <Profile user={user} onUser={setUser} onClose={() => setPanel(null)} />
      )}
      {panel === "how" && (
        <Modal
          title="Makan enak. Caranya gampang."
          onClose={() => setPanel(null)}
        >
          <div className="steps">
            {[
              [
                "01",
                "Temukan yang kamu suka",
                "Jelajahi makanan surplus di daftar atau peta. Pilih makanan dan periksa waktu pengambilannya.",
              ],
              [
                "02",
                "Pesan dengan harga lebih hemat",
                "Daftar sebagai pembeli, pilih jumlah porsi, lalu jalankan simulasi pembayaran. Tidak ada uang yang ditagih.",
              ],
              [
                "03",
                "Ambil dan habisin!",
                "Tunjukkan kode tiket di toko saat waktu pengambilan. Bawa wadah sendiri untuk langkah baik ekstra.",
              ],
            ].map(([number, title, text]) => (
              <div key={number}>
                <span>{number}</span>
                <section>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </section>
              </div>
            ))}
          </div>
          <button
            className="button primary full"
            onClick={() => {
              setPanel(null);
              document
                .getElementById("explore")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Mulai jelajah
            <Compass size={18} />
          </button>
        </Modal>
      )}
      {panel === "impact" && (
        <Modal title="Satu porsi punya arti." onClose={() => setPanel(null)}>
          <div className="impact-icon">
            <Sprout size={44} />
          </div>
          <p className="modal-description">
            Dengan menghabiskan makanan layak santap, kita membantu mengurangi
            sampah makanan dan menghargai sumber daya untuk membuatnya.
          </p>
          <div className="impact-grid">
            <div>
              <strong>0,5 kg</strong>
              <span>Asumsi berat per porsi</span>
            </div>
            <div>
              <strong>1,25 kg</strong>
              <span>Estimasi CO₂e per porsi</span>
            </div>
          </div>
          <p className="fine-print">
            Ilustrasi kalkulator: berat makanan × 2,5 kg CO₂e. Ini estimasi
            demo, bukan pengukuran dampak aktual. Pesanan demo tidak dihitung
            sebagai makanan terselamatkan.
          </p>
          <button
            className="button primary full"
            onClick={() => setPanel(null)}
          >
            Mulai dari makananmu
            <Leaf size={17} />
          </button>
        </Modal>
      )}
      {panel === "partner" && (
        <Modal
          title={
            user?.role === "admin" ? "Dasbor admin" : "Tumbuh bersama HABISIN."
          }
          onClose={() => setPanel(null)}
        >
          <div className="impact-icon">
            <Users size={40} />
          </div>
          {user && user.role !== "buyer" ? (
            <>
              <p className="success">
                Kamu masuk sebagai {user.role === "admin" ? "admin" : "mitra"}.
                Akses ini diverifikasi oleh server.
              </p>
              {dashboard ? (
                <>
                  <div className="impact-grid">
                    <div>
                      <strong>{dashboard.listings}</strong>
                      <span>Listing demo aktif</span>
                    </div>
                    {dashboard.users !== null && (
                      <div>
                        <strong>{dashboard.users}</strong>
                        <span>Akun terdaftar</span>
                      </div>
                    )}
                  </div>
                  <p className="modal-description">{dashboard.message}</p>
                </>
              ) : (
                <p role="status">{dashboardError || "Memuat dasbor…"}</p>
              )}
            </>
          ) : (
            <>
              <p className="modal-description">
                Makanan berlebih punya kesempatan baru. Buat akun mitra untuk
                menjadi bagian dari HABISIN.
              </p>
              <p className="fine-print">
                Demo ini mencakup akun mitra. Pendaftaran toko, pengelolaan
                produk, dan moderasi akan hadir pada tahap berikutnya.
              </p>
              {!user && (
                <button
                  className="button primary full"
                  onClick={() => {
                    setRegistrationRole("partner");
                    setPanel("register");
                  }}
                >
                  Buat akun mitra
                  <ArrowRight size={18} />
                </button>
              )}
            </>
          )}
        </Modal>
      )}
      {selected && (
        <Modal
          title="Kesempatan enak hari ini."
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div
            className="detail-image"
            style={{ backgroundImage: `url("${selected.image}")` }}
          />
          <div className="detail-heading">
            <div>
              <small>{selected.store}</small>
              <h3>{selected.name}</h3>
            </div>
            <strong className="price">{rupiah(selected.price)}</strong>
          </div>
          <p className="modal-description">{selected.description}</p>
          <div className="detail-info">
            <p>
              <MapPin size={16} />
              {selected.address}
            </p>
            <p>
              <Clock3 size={16} />
              {online
                ? `${pickup(selected.pickup_start)}–${pickup(selected.pickup_end)}`
                : "17.00–21.00"}{" "}
              WIB · Ambil langsung di toko
            </p>
          </div>
          <div className="quantity-row">
            <label htmlFor="quantity">
              Jumlah porsi <small>{selected.stock} tersedia</small>
            </label>
            <input
              id="quantity"
              type="number"
              min={1}
              max={Math.min(selected.stock, 10)}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
          <div className="total-row">
            <span>Total</span>
            <strong>{rupiah(selected.price * quantity)}</strong>
          </div>
          <p className="fine-print">
            Simulasi pembayaran demo. Tidak ada tagihan atau transaksi uang
            sungguhan.
          </p>
          {orderError && (
            <p className="error" role="alert">
              {orderError}
            </p>
          )}
          {user && user.role !== "buyer" && (
            <p className="error">Gunakan akun pembeli untuk memesan makanan.</p>
          )}
          <button
            className="button primary full"
            onClick={book}
            disabled={
              busy ||
              !online ||
              selected.stock < 1 ||
              !Number.isInteger(quantity) ||
              quantity < 1 ||
              quantity > Math.min(selected.stock, 10) ||
              (!!user && user.role !== "buyer")
            }
          >
            {busy
              ? "Memproses…"
              : !online
                ? "Backend belum terhubung"
                : !user
                  ? "Masuk untuk memesan"
                  : selected.price === 0
                    ? "Klaim donasi gratis"
                    : "Simulasikan pembayaran berhasil"}
            <ArrowRight size={18} />
          </button>
        </Modal>
      )}
      {ticket && (
        <Modal title="Makananmu sudah dipesan!" onClose={() => setTicket(null)}>
          <div className="ticket">
            <span className="ticket-check">
              <Check size={30} />
            </span>
            <p>KODE PENGAMBILAN</p>
            <strong>{ticket.code}</strong>
            <h3>{ticket.listing.name}</h3>
            <span>
              {ticket.quantity} porsi · {rupiah(ticket.total)}
            </span>
            <hr />
            <p>{ticket.listing.store}</p>
            <small>{ticket.listing.address}</small>
            <p>Ambil sebelum {pickup(ticket.listing.pickup_end)} WIB</p>
          </div>
          <p className="fine-print">
            Tiket demo tersimpan di Pesanan saya. Verifikasi kasir belum
            tersedia pada demo ini.
          </p>
          <button
            className="button primary full"
            onClick={() => {
              setTicket(null);
              showOrders();
            }}
          >
            Lihat pesanan saya
            <Ticket size={18} />
          </button>
        </Modal>
      )}
      {panel === "orders" && (
        <Modal title="Pesanan saya" onClose={() => setPanel(null)}>
          {ordersLoading ? (
            <p className="modal-description">Memuat pesanan…</p>
          ) : orders.length === 0 ? (
            <div className="empty-state">
              <ShoppingBag size={35} />
              <h3>Petualangan enakmu dimulai di sini.</h3>
              <p>Belum ada pesanan. Yuk, selamatkan porsi pertamamu.</p>
              <button className="button primary" onClick={() => setPanel(null)}>
                Jelajahi makanan
              </button>
            </div>
          ) : (
            <div className="order-list">
              {orders.map((order) => (
                <div className="order-item" key={order.id}>
                  <div className="order-heading">
                    <strong>{order.listing.name}</strong>
                    <span
                      className={
                        order.status === "cancelled"
                          ? "cancelled-label"
                          : "success-label"
                      }
                    >
                      {order.status === "cancelled" ? "Dibatalkan" : "Dipesan"}
                    </span>
                  </div>
                  <p>
                    {order.quantity} porsi · {rupiah(order.total)} ·{" "}
                    {order.listing.store}
                  </p>
                  <small>
                    Ambil sebelum {pickup(order.listing.pickup_end)} WIB
                  </small>
                  {order.status === "reserved" && (
                    <div className="order-actions">
                      <button
                        className="text-button"
                        onClick={() => {
                          setPanel(null);
                          setTicket(order);
                        }}
                      >
                        Tiket {order.code}
                        <Ticket size={15} />
                      </button>
                      <button
                        className="cancel-button"
                        disabled={busy}
                        onClick={() => cancel(order)}
                      >
                        Batalkan
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {orderError && (
            <p className="error" role="alert">
              {orderError}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
