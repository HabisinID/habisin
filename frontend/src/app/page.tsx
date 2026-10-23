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
import { useRouter } from "next/navigation";
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
import PartnerListings from "@/components/partner-listings";
import {
  api,
  distance,
  listingCategories,
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
    <div className="map-loading h-[530px] w-full z-[0] bg-[#e9efdf] grid place-items-center text-[#6b805e]">
      Menyiapkan peta di sekitarmu…
    </div>
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
const categories = ["Semua", ...listingCategories];
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
  const router = useRouter();
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
    if (user?.role === "admin")
      api<{ users: number | null; listings: number; message: string }>(
        "dashboard",
      )
        .then(setDashboard)
        .catch((e) => setDashboardError(e.message));
  }
  function updateCatalog(item: Listing | null, id: number) {
    setItems((current) => {
      const remaining = current.filter((row) => row.id !== id);
      return item?.active && new Date(item.pickup_end).getTime() > Date.now()
        ? [...remaining, item]
        : remaining;
    });
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
      {/* <div className="announcement">
        <Leaf size={13} />
        <span>Makanan baik layak mendapat kesempatan kedua.</span>
        <span className="announcement-link">
          Yuk, mulai dari piringmu <ArrowUpRight size={13} />
        </span>
      </div> */}
      <header className="header h-22 bg-[#fafaf6f5] [border-bottom:1px_solid_var(--color-line)] [&_nav]:flex [&_nav]:items-center [&_nav]:gap-[30px] [&_nav]:h-full [&_nav]:text-[13px] [&_nav_>_a]:h-full [&_nav_>_a]:flex [&_nav_>_a]:items-center [&_nav_>_a]:gap-[7px] [&_nav_>_a]:relative [&_nav_>_a]:text-[#6a746c] [&_nav_>_button]:h-full [&_nav_>_button]:flex [&_nav_>_button]:items-center [&_nav_>_button]:gap-[7px] [&_nav_>_button]:relative [&_nav_>_button]:text-[#6a746c] [&_nav_.nav-active]:text-brand [&_nav_.nav-active]:font-bold compact:[&_nav]:gap-[18px] tablet:h-18 tablet:[&_nav]:hidden">
        <div className="header-inner max-w-300 py-0 px-8 h-full m-auto flex items-center justify-between gap-[35px] min-[1450px]:max-w-320 compact:gap-5 tablet:py-0 tablet:px-[22px]">
          <Link
            className="brand text-[31px] [font-weight:850] tracking-[-1.8px] flex items-center tablet:text-[28px]"
            href="/"
            aria-label="Habisin beranda"
          >
            <span className="brand-icon grid place-items-center bg-brand text-white w-[35px] h-9 rounded-[12px_12px_12px_3px] mr-2 tablet:w-[30px] tablet:h-8">
              <Sprout size={25} strokeWidth={2.5} />
            </span>
            habisin<span className="brand-dot text-brand">.</span>
          </Link>
          <nav aria-label="Navigasi utama">
            <a
              className='nav-active [&:after]:[content:""] [&:after]:absolute [&:after]:bottom-[21px] [&:after]:left-0 [&:after]:right-0 [&:after]:h-[2px] [&:after]:bg-brand'
              href="#explore"
            >
              Jelajahi
            </a>
            <button onClick={() => setPanel("how")}>Cara kerja</button>
            <button onClick={() => setPanel("impact")}>
              Dampak kita{" "}
              <span className="tiny-dot w-[5px] h-[5px] bg-[#c69e43] rounded-[50%] inline-block" />
            </button>
          </nav>
          <div className="header-actions flex items-center gap-5 text-[12px] font-semibold compact:gap-[13px] tablet:gap-[14px] mobile:gap-2">
            <button
              className="partner-link flex gap-[6px] items-center compact:hidden"
              onClick={openPartner}
            >
              {user?.role === "admin"
                ? "Dasbor admin"
                : user?.role === "partner"
                  ? "Dasbor mitra"
                  : "Jadi mitra"}
              <ArrowUpRight size={15} />
            </button>
            <span className="header-divider h-[23px] w-[1px] bg-line compact:hidden" />
            {user ? (
              <>
                {user.role === "partner" && (
                  <Link
                    href="/partner/store"
                    className="text-xs font-semibold text-brand"
                    aria-label="Toko saya"
                  >
                    Toko
                  </Link>
                )}
                <button
                  className="account-button flex items-center gap-[7px] mobile:[&_>_span:last-child]:max-w-[65px] mobile:[&_>_span:last-child]:overflow-hidden mobile:[&_>_span:last-child]:text-ellipsis"
                  onClick={() => setPanel("profile")}
                >
                  <span className="avatar small w-[45px] h-[45px] rounded-[50%] bg-[#e3eddb] text-brand grid place-items-center font-bold text-[20px] [&.small]:w-[30px] [&.small]:h-[30px] [&.small]:text-[12px]">
                    {(user.name || user.username)[0].toUpperCase()}
                  </span>
                  <span>{user.name.split(" ")[0] || user.username}</span>
                </button>
                <button
                  className="icon-button inline-grid place-items-center p-[5px] text-[#708168] rounded-[5px] hover:bg-[#edf1e7]"
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
                  className="button primary signup inline-flex items-center justify-center gap-3 rounded-2 py-[11px] px-[17px] text-[12px] font-semibold min-h-10 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)] tablet:py-[9px] tablet:px-3 tablet:min-h-[35px] tablet:text-[10px] tablet:[&_svg]:hidden"
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
        <section className="hero wrap max-w-300 my-0 mx-auto px-8 grid grid-cols-[1.05fr_1fr] min-h-120 items-center gap-[30px] py-[45px] min-[1450px]:max-w-320 min-[1450px]:min-h-130 compact:gap-[10px] tablet:px-[22px] tablet:grid-cols-[1fr_1fr] tablet:min-h-95 tablet:pt-8 tablet:pb-[30px] tablet:gap-0 mobile:flex mobile:flex-col mobile:items-stretch mobile:pt-[31px] mobile:pb-5">
          <div className="hero-copy [&_>_p]:leading-[1.85] [&_>_p]:text-[#737a70] [&_>_p]:text-[14px] tablet:[&_>_p]:text-[11px] mobile:text-center mobile:[&_.eyebrow]:justify-center mobile:[&_.eyebrow]:text-[7px] mobile:[&_>_p]:max-w-[275px] mobile:[&_>_p]:m-auto mobile:[&_>_p]:text-[12px]">
            <h1 className="hero-heading mt-[22px] mr-0 mb-[21px] ml-0 text-[66px] leading-[1.11] tracking-[-3px] [font-weight:750] [&_>_span]:text-brand [&_>_span]:relative [&_>_span]:inline-block [&_svg]:absolute [&_svg]:left-0 [&_svg]:bottom-[-8px] [&_svg]:w-full [&_svg]:h-[14px] [&_svg]:fill-none [&_svg]:stroke-[#dbb558] [&_svg]:stroke-[5] [&_svg]:[stroke-linecap:round] compact:text-[55px] tablet:text-[44px] tablet:tracking-[-2px] tablet:mt-[17px] tablet:mr-0 tablet:mb-[22px] tablet:ml-0 mobile:text-[43px] mobile:leading-[1.08] mobile:mt-[17px]">
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
              <br className="desktop-break tablet:hidden" /> lebih hemat.
              Selamatkan rasanya, kurangi sisanya.
            </p>
            <div className="hero-actions flex items-center gap-[18px] mt-[25px] tablet:mt-[19px] mobile:justify-center mobile:mt-[22px]">
              <a
                href="#explore"
                className="button primary hero-cta inline-flex items-center justify-center gap-3 rounded-2 py-[15px] px-[19px] text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)] tablet:text-[10px] tablet:p-3 tablet:gap-2 mobile:py-[14px] mobile:px-5 mobile:text-[11px]"
              >
                Cari makanan di dekatmu
                <ArrowDown size={17} />
              </a>
            </div>
          </div>
          <div className="hero-art relative h-[370px] flex items-center justify-center min-[1450px]:h-100 tablet:h-[290px] mobile:w-[310px] mobile:h-70 mobile:self-[center] mobile:mt-[18px]">
            <div className="hero-circle absolute w-[350px] h-[350px] rounded-[50%] bg-[#e9eedc] right-[35px] top-[10px] min-[1450px]:w-[390px] min-[1450px]:h-[390px] min-[1450px]:right-[30px] compact:w-75 compact:h-75 compact:right-[10px] compact:top-[35px] tablet:w-[230px] tablet:h-[230px] tablet:right-0 tablet:top-[30px] mobile:w-[255px] mobile:h-[255px] mobile:right-[10px] mobile:top-[10px]" />
            <div className="orbit orbit-one absolute w-100 h-80 [border:1px_solid_#d2dcc2] rounded-[50%] [transform:rotate(-30deg)] left-7 top-[27px] min-[1450px]:w-115 min-[1450px]:h-[350px] compact:w-80 compact:h-[290px] compact:left-[15px] compact:top-10 tablet:w-65 tablet:h-60 tablet:left-0 tablet:top-5 mobile:w-[290px] mobile:h-[235px] mobile:left-[9px] mobile:top-5" />
            <div className="orbit orbit-two absolute w-90 h-[365px] [border:1px_solid_#d2dcc2] rounded-[50%] [transform:rotate(35deg)] left-15 top-0 border-dashed min-[1450px]:w-[410px] min-[1450px]:h-100 compact:w-[290px] compact:h-[330px] compact:left-[38px] compact:top-5 tablet:w-65 tablet:h-60 tablet:left-0 tablet:top-5 tablet:hidden mobile:w-[290px] mobile:h-[235px] mobile:left-[9px] mobile:top-5" />
            <span className="floating-star star-one absolute text-brand text-[43px] z-[1] right-[15px] top-5 tablet:text-[28px] tablet:right-0 tablet:top-[5px]">
              ✳
            </span>
            <span className="floating-star star-two absolute text-[#be9e4b] text-[27px] z-[1] left-[30px] bottom-[23px] tablet:text-[20px] tablet:left-0 tablet:bottom-[30px]">
              ✳
            </span>
            <div
              className='hero-image w-[310px] h-[310px] rounded-[50%] [background:#dae1cb_url("https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=90")_center/cover] relative [border:12px_solid_#f6f4e9] shadow-[0_19px_35px_#30432724] [transform:rotate(-12deg)] ml-[30px] min-[1450px]:w-85 min-[1450px]:h-85 compact:w-[270px] compact:h-[270px] tablet:w-55 tablet:h-55 tablet:[border-width:8px] tablet:ml-[10px] mobile:w-[235px] mobile:h-[235px]'
              role="img"
              aria-label="Semangkuk makanan segar dengan sayuran berwarna-warni"
            />
            <div className="food-tag absolute left-0 top-[58px] py-[13px] px-[14px] bg-[white] rounded-[11px] shadow-[0_8px_30px_#34462e0c] flex gap-[9px] items-center [transform:rotate(-6deg)] z-[1] [&_strong]:text-[11px] [&_strong]:block [&_small]:text-[8px] [&_small]:text-[#8a8e81] [&_small]:block [&_small]:mt-1 [&_>_span:last-child]:text-[#d2a948] [&_>_span:last-child]:ml-[5px] compact:left-0 compact:top-[65px] compact:p-[10px] tablet:p-[9px] tablet:top-[35px] tablet:left-[-5px] tablet:gap-[5px] tablet:[&_strong]:text-[8px] tablet:[&_small]:text-[6px] tablet:[&_>_span:last-child]:hidden mobile:left-0 mobile:top-[30px] mobile:[&_strong]:text-[9px] mobile:[&_small]:text-[7px]">
              <span className="tag-icon w-8 h-8 rounded-[50%] grid place-items-center bg-[#f7efd9] text-[#aa8734] tablet:w-[25px] tablet:h-[25px] tablet:[&_svg]:w-[14px]">
                <Utensils size={19} />
              </span>
              <div>
                <strong>Masih enak banget!</strong>
                <small>Cuma harganya yang berkurang.</small>
              </div>
            </div>
            <div className="discount-tag absolute right-2 bottom-[53px] bg-yellow [border:4px_solid_#fafaf6] [outline:1px_dashed_#bf963d] w-[114px] h-[114px] rounded-[50%] flex flex-col items-center justify-center [transform:rotate(10deg)] text-[#345436] [&_>_span:first-child]:text-[8px] [&_>_span:first-child]:font-bold [&_>_span:first-child]:tracking-[0.9px] [&_strong]:text-[42px] [&_strong]:font-extrabold [&_strong]:leading-[1.1] [&_strong]:tracking-[-2px] [&_strong_small]:text-[22px] [&_strong_small]:tracking-[-1px] [&_>_span:last-child]:text-[8px] compact:right-0 compact:bottom-[58px] compact:w-25 compact:h-25 tablet:w-[85px] tablet:h-[85px] tablet:bottom-[30px] tablet:right-[-7px] tablet:[&_strong]:text-[32px] tablet:[&_>_span:first-child]:text-[6px] tablet:[&_>_span:last-child]:text-[6px] mobile:right-0 mobile:bottom-[25px]">
              <span>HEMAT SAMPAI</span>
              <strong>
                70<small>%</small>
              </strong>
              <span>rasa 100% juara</span>
            </div>
            <div className="earth-tag absolute bottom-4 left-[105px] [transform:rotate(-4deg)] flex items-center gap-2 text-[10px] bg-[white] rounded-[25px] py-[9px] px-[14px] shadow-[0_3px_15px_#263b2a08] [&_>_span]:bg-[#eaf2e6] [&_>_span]:text-brand [&_>_span]:rounded-[50%] [&_>_span]:p-[5px] [&_>_span]:grid [&_>_span]:place-items-center tablet:text-[8px] tablet:left-[30px] tablet:bottom-2 tablet:py-[5px] tablet:px-[9px] mobile:left-[62px] mobile:bottom-0">
              <span>
                <Leaf size={16} />
              </span>
              Less waste, more taste.
            </div>
          </div>
        </section>

        <section
          className="explore wrap max-w-300 my-0 mx-auto px-8 pt-[55px] pb-5 min-[1450px]:max-w-320 tablet:px-[22px] tablet:pt-9"
          id="explore"
        >
          <div className="section-top flex justify-between items-center mb-[27px] [&_h2]:text-[31px] [&_h2]:tracking-[-1.1px] [&_h2]:font-bold [&_h2_span]:text-brand [&_p]:text-[12px] [&_p]:text-[#83897e] [&_p]:mt-[10px] tablet:[&_h2]:text-[25px] tablet:[&_p]:text-[10px] mobile:gap-[10px] mobile:items-start mobile:[&_h2]:text-[21px] mobile:[&_h2]:tracking-[-0.8px] mobile:[&_p]:text-[9px] mobile:[&_p]:max-w-[190px] mobile:[&_p]:leading-[1.7] mobile:[&_p]:mt-[6px]">
            <div>
              <h2>
                Yang enak di dekatmu<span>.</span>
              </h2>
            </div>
            <button
              className="location-button flex items-center gap-[11px] [border:1px_solid_#e0e5d9] rounded-[9px] bg-[#f5f6ef] py-3 px-[15px] text-left text-[#5c7757] [&_small]:block [&_small]:text-[9px] [&_small]:text-[#8b9284] [&_small]:mb-1 [&_strong]:text-[12px] [&_>_svg:last-child]:ml-[22px] tablet:py-[9px] tablet:px-[10px] tablet:gap-[7px] tablet:[&_>_svg:last-child]:ml-[5px] tablet:[&_strong]:text-[10px] tablet:[&_small]:text-[8px] mobile:p-2 mobile:gap-1 mobile:mt-2 mobile:[&_>_svg:first-child]:w-[13px] mobile:[&_>_svg:last-child]:hidden mobile:[&_strong]:text-[9px] mobile:[&_small]:text-[7px]"
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
          <div className="search-row flex gap-3 mb-[21px] tablet:flex-wrap tablet:gap-[9px]">
            <div className="search-box flex items-center gap-3 [flex:1] [border:1px_solid_#e2e6dc] bg-[white] rounded-2 py-0 px-4 text-[#87947d] [&_input]:[border:0] [&_input]:bg-none [&_input]:w-full [&_input]:h-[47px] [&_input]:text-[12px] [&_input]:text-dark [&_input:focus]:[outline:none] [&:focus-within]:[outline:2px_solid_#8bb697] [&_input::placeholder]:text-[#9a9f93] tablet:min-w-[65%] tablet:[&_input]:text-[10px] mobile:py-0 mobile:px-[10px] mobile:gap-2 mobile:[&_>_svg]:w-4 mobile:[&_input]:h-[43px] mobile:[&_input]:text-[10px]">
              <Search size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Lagi pengin makan apa? Cari makanan atau toko…"
                aria-label="Cari makanan atau toko"
              />
              {query && (
                <button
                  className="icon-button inline-grid place-items-center p-[5px] text-[#708168] rounded-[5px] hover:bg-[#edf1e7]"
                  aria-label="Hapus pencarian"
                  onClick={() => setQuery("")}
                >
                  <X size={17} />
                </button>
              )}
            </div>
            <button
              className={`button filter-button inline-flex items-center justify-center gap-3 rounded-2 py-[11px] px-[17px] text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] [border:1px_solid_#e1e5da] bg-[white] text-[#606e59] [&.selected]:bg-[#e8efdf] tablet:min-h-10 tablet:text-[10px] tablet:py-[10px] tablet:px-3 ${filters ? "selected" : ""}`}
              onClick={() => setFilters(!filters)}
              aria-expanded={filters}
            >
              <SlidersHorizontal size={18} />
              Filter
              {maxPrice < 60000 && (
                <span className="tiny-dot w-[5px] h-[5px] bg-[#c69e43] rounded-[50%] inline-block" />
              )}
            </button>
            <div
              className="view-toggle flex [border:1px_solid_#e2e5dc] p-1 rounded-2 gap-1 bg-[#f0f2eb] [&_>_button]:flex [&_>_button]:items-center [&_>_button]:gap-[7px] [&_>_button]:py-[9px] [&_>_button]:px-[13px] [&_>_button]:text-[11px] [&_>_button]:text-[#848d7c] [&_>_button]:rounded-[5px] [&_.active]:text-brand [&_.active]:bg-[white] [&_.active]:shadow-[0_1px_4px_#273a2a0d] [&_.active]:font-semibold tablet:ml-auto"
              aria-label="Tampilan makanan"
            >
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
            <div className="filter-panel flex gap-[25px] items-center p-[18px] [border:1px_solid_var(--color-line)] rounded-2 bg-[#f0f4e9] mb-[18px] [&_>_label]:flex [&_>_label]:items-center [&_>_label]:gap-[15px] [&_>_label]:text-[11px] [&_input]:accent-[var(--color-brand)] [&_input]:max-w-45 tablet:flex-wrap tablet:gap-3 tablet:[&_>_label]:flex-wrap tablet:[&_>_label]:gap-[10px] tablet:[&_>_label]:w-full">
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
                className={`chip flex items-center gap-[7px] [border:1px_solid_#e3e7dd] rounded-[6px] py-[10px] px-[15px] text-[11px] text-[#737d6c] bg-[#fff] [&_>_span]:text-[13px] [&.active]:bg-brand [&.active]:[border-color:var(--color-brand)] [&.active]:text-white compact:py-[10px] compact:px-3 tablet:whitespace-nowrap tablet:py-[9px] tablet:px-3 tablet:text-[10px] mobile:text-[9px] mobile:py-[9px] mobile:px-[11px] ${savedOnly ? "active" : ""}`}
                onClick={() => setSavedOnly(!savedOnly)}
              >
                <Heart size={16} />
                Favorit saya
              </button>
              <button
                className="text-button inline-flex gap-2 items-center text-brand text-[11px] font-semibold py-[6px] px-0"
                onClick={resetFilters}
              >
                Reset filter
              </button>
            </div>
          )}
          <div className="category-row flex justify-between items-center pb-[22px] [border-bottom:1px_solid_var(--color-line)] gap-[15px] tablet:items-start tablet:flex-col tablet:gap-4 mobile:pb-[15px] mobile:gap-3">
            <div className="category-tabs flex gap-2 tablet:w-full tablet:overflow-auto tablet:py-[2px] tablet:px-0 mobile:gap-[6px]">
              {categories.map((item, index) => (
                <button
                  className={`chip flex items-center gap-[7px] [border:1px_solid_#e3e7dd] rounded-[6px] py-[10px] px-[15px] text-[11px] text-[#737d6c] bg-[#fff] [&_>_span]:text-[13px] [&.active]:bg-brand [&.active]:[border-color:var(--color-brand)] [&.active]:text-white compact:py-[10px] compact:px-3 tablet:whitespace-nowrap tablet:py-[9px] tablet:px-3 tablet:text-[10px] mobile:text-[9px] mobile:py-[9px] mobile:px-[11px] ${category === item ? "active" : ""}`}
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
            <label className="donation-toggle flex items-center gap-[7px] text-[#78866b] text-[11px] cursor-[pointer] whitespace-nowrap [&_input]:absolute [&_input]:opacity-[0] [&_input]:w-8 [&_input]:h-5 [&_input:checked_+_.switch]:pointer-events-none [&_input:checked_+_.switch]:bg-brand [&_input:checked_+_.switch:after]:[transform:translateX(12px)] [&_input:focus-visible_+_.switch]:pointer-events-none [&_input:focus-visible_+_.switch]:[outline:2px_solid_#548c62] [&_input:focus-visible_+_.switch]:outline-offset-[3px] tablet:self-[flex-end]">
              <input
                type="checkbox"
                checked={free}
                onChange={(e) => setFree(e.target.checked)}
              />
              <span className='switch pointer-events-none w-[29px] h-[17px] rounded-5 bg-[#dfe4d9] relative mr-1 [&:after]:[content:""] [&:after]:absolute [&:after]:w-[13px] [&:after]:h-[13px] [&:after]:rounded-[50%] [&:after]:bg-[white] [&:after]:top-[2px] [&:after]:left-[2px] [&:after]:shadow-[0_1px_3px_#0002] [&:after]:[transition:transform_0.2s]' />
              <Heart size={15} />
              Donasi gratis
            </label>
          </div>
          <div className="results-meta flex justify-between items-center my-5 mx-0 text-[10px] text-[#939a8c] [&_strong]:text-[#5f6c54] [&_strong]:font-semibold [&_label]:flex [&_label]:items-center [&_label]:gap-1 [&_select]:[border:0] [&_select]:text-[#647257] [&_select]:[background:transparent] [&_select]:text-[10px] [&_select]:cursor-[pointer] tablet:gap-2 tablet:text-[9px] mobile:text-[8px] mobile:[&_select]:text-[9px] mobile:[&_select]:max-w-25 mobile:[&_>_p]:max-w-[190px]">
            <p>
              <strong>{visible.length} pilihan lezat</strong> untuk diselamatkan{" "}
              <span className="demo-badge text-[8px] py-1 px-[6px] bg-[#ecefe5] rounded-1 ml-[6px] whitespace-nowrap tablet:text-[7px] tablet:py-[3px] tablet:px-1 tablet:ml-[3px] mobile:inline-block mobile:ml-0 mobile:mt-1">
                Katalog demo
              </span>
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
            <div
              className="offline-note mb-[18px] bg-[#fff5d9] [border:1px_solid_#ebdfb8] py-3 px-[15px] rounded-[7px] text-[11px] text-[#8b763e]"
              role="status"
            >
              Kamu sedang melihat pratinjau demo. Jalankan backend untuk masuk
              dan memesan.
            </div>
          )}
          {visible.length === 0 ? (
            <div className="empty-state flex flex-col items-center justify-center gap-4 text-center py-[55px] px-5 text-[#69815e] bg-[#f2f5ec] [border:1px_dashed_#d6dfca] rounded-3 [&_h3]:text-[18px] [&_p]:text-[12px] [&_p]:leading-[1.7] [&_p]:text-[#849477]">
              <Search size={32} />
              <h3>Belum ada yang cocok.</h3>
              <p>Coba kata kunci lain atau ubah filter pencarianmu.</p>
              <button
                className="button primary inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)]"
                onClick={resetFilters}
              >
                Lihat semua makanan
              </button>
            </div>
          ) : view === "map" ? (
            <div className="map-view relative rounded-3 overflow-hidden [border:1px_solid_#dde4d5]">
              <FoodMap items={visible} origin={origin} onSelect={selectItem} />
              <div className="map-help absolute bottom-[25px] left-[50%] [transform:translateX(-50%)] z-[500] bg-[white] py-[11px] px-[15px] rounded-2 shadow-[0_2px_15px_#0002] flex items-center gap-2 text-[11px] whitespace-nowrap [&_button]:text-brand [&_button]:ml-[10px] tablet:text-[9px] tablet:p-[9px] mobile:text-[8px] mobile:gap-1 mobile:[&_button]:ml-[3px]">
                <MapPin size={15} />
                Pilih harga di peta untuk melihat makanan.
                <button onClick={locate} aria-label="Gunakan lokasi saya">
                  <LocateFixed size={19} />
                </button>
              </div>
            </div>
          ) : (
            <div className="food-grid grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-[23px] compact:gap-[17px] tablet:grid-cols-[repeat(2,_minmax(0,_1fr))] tablet:gap-4 mobile:gap-3">
              {visible.map((item) => (
                <article
                  className="food-card bg-[white] [border:1px_solid_#e4e7de] rounded-3 overflow-hidden [transition:transform_0.2s,_box-shadow_0.2s] hover:[transform:translateY(-4px)] hover:shadow-[0_12px_25px_#263b2410] [&:hover_.card-image]:[transform:scale(1.035)]"
                  key={item.id}
                >
                  <div className="card-image-wrap h-[197px] relative overflow-hidden bg-[#dce3d4] min-[1450px]:h-55 compact:h-[165px] tablet:h-[175px] mobile:h-34">
                    <button
                      className="image-button w-full h-full p-0 block"
                      onClick={() => selectItem(item)}
                      aria-label={`Lihat ${item.name}`}
                    >
                      <div
                        className="card-image w-full h-full bg-cover bg-center [transition:transform_0.5s]"
                        style={{ backgroundImage: `url("${item.image}")` }}
                      />
                    </button>
                    <span
                      className={`discount-badge absolute left-[13px] top-[13px] bg-[#fff9e6] text-[#6c622f] py-[6px] px-[9px] rounded-[5px] text-[9px] font-bold pointer-events-none flex items-center gap-1 [&.donation]:bg-[#e4f2dd] [&.donation]:text-[#3f753f] mobile:text-[7px] mobile:left-2 mobile:top-[9px] mobile:py-[5px] mobile:px-[6px] ${item.price === 0 ? "donation" : ""}`}
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
                      className={`favorite absolute top-3 right-3 w-[31px] h-[31px] rounded-[50%] bg-[#fffffff0] text-[#687363] grid place-items-center [&.is-saved]:text-[#c35c52] mobile:w-[26px] mobile:h-[26px] mobile:top-[7px] mobile:right-[7px] mobile:[&_svg]:w-[14px] ${saved.includes(item.id) ? "is-saved" : ""}`}
                      onClick={() => toggleSaved(item.id)}
                      aria-label={`${saved.includes(item.id) ? "Hapus" : "Simpan"} ${item.name} ${saved.includes(item.id) ? "dari" : "ke"} favorit`}
                      aria-pressed={saved.includes(item.id)}
                    >
                      <Heart
                        size={18}
                        fill={saved.includes(item.id) ? "currentColor" : "none"}
                      />
                    </button>
                    <span className="stock-badge absolute bottom-3 left-[13px] bg-[#ffffffed] rounded-1 flex items-center gap-[5px] py-[5px] px-[7px] text-[8px] text-[#685f41] pointer-events-none [&_>_span]:w-1 [&_>_span]:h-1 [&_>_span]:rounded-[50%] [&_>_span]:bg-[#d4a34b] mobile:text-[7px] mobile:left-2 mobile:bottom-2">
                      <span />
                      {item.stock > 0
                        ? `Sisa ${item.stock} porsi`
                        : "Sudah habis"}
                    </span>
                  </div>
                  <div className="card-content pt-[17px] pr-[17px] pb-3 pl-[17px] compact:p-[14px] mobile:pt-[11px] mobile:pr-[10px] mobile:pb-[9px] mobile:pl-[10px]">
                    <div className="store-line flex justify-between gap-[5px] text-[9px] text-[#889080] mb-[9px] [&_>_span:last-child]:flex [&_>_span:last-child]:items-center [&_>_span:last-child]:gap-[3px] [&_>_span:last-child]:whitespace-nowrap compact:text-[8px] tablet:text-[8px] mobile:flex-wrap mobile:text-[7px] mobile:gap-[5px] mobile:mb-[6px]">
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
                      className="card-title text-[16px] font-bold tracking-[-0.3px] text-left text-[#344b35] p-0 compact:text-[14px] tablet:text-[15px] mobile:text-[12px] mobile:min-h-[29px] mobile:leading-[1.4]"
                      onClick={() => selectItem(item)}
                    >
                      {item.name}
                    </button>
                    <div className="pickup flex items-center gap-[5px] text-[9px] text-[#8b9482] mt-[9px] mobile:text-[7px] mobile:gap-[3px] mobile:mt-[7px] mobile:[&_svg]:w-[10px]">
                      <Clock3 size={13} />
                      Ambil{" "}
                      {online
                        ? `${pickup(item.pickup_start)}–${pickup(item.pickup_end)}`
                        : "17.00–21.00"}{" "}
                      WIB
                    </div>
                    <div className="card-bottom flex justify-between items-center [border-top:1px_solid_#edf0e7] mt-[15px] pt-3 [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-[9px] mobile:mt-[11px] mobile:pt-[9px] mobile:[&_>_div]:gap-1 mobile:[&_>_div]:flex-wrap">
                      <div>
                        <span
                          className={`price text-brand text-[17px] font-bold tracking-[-0.4px] tablet:text-[16px] mobile:text-[13px] ${item.price === 0 ? "free" : ""}`}
                        >
                          {rupiah(item.price)}
                        </span>
                        <span className="old-price text-[#a0a596] text-[10px] line-through mobile:text-[8px]">
                          {rupiah(item.original_price)}
                        </span>
                      </div>
                      <button
                        className="card-arrow w-[29px] h-[29px] grid place-items-center [border:1px_solid_#e1e7d8] rounded-[50%] text-brand bg-[#f9faf5] hover:bg-[#e9f1e2] mobile:w-6 mobile:h-6 mobile:shrink-0 mobile:[&_svg]:w-4"
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
          <div className="catalog-foot flex items-center justify-between mt-6 text-[#939b8a] text-[10px] [&_>_span]:flex [&_>_span]:items-center [&_>_span]:gap-[6px] mobile:text-[8px] mobile:[&_.text-button]:text-[9px]">
            <span>
              <Check size={15} /> Dibuat hari ini, dinikmati hari ini.
            </span>
            <button
              className="text-button inline-flex gap-2 items-center text-brand text-[11px] font-semibold py-[6px] px-0"
              onClick={showOrders}
            >
              Pesanan saya <Ticket size={17} />
            </button>
          </div>
        </section>
        <section className="join-banner wrap max-w-284 my-9 mx-auto px-8 bg-[#ecf0e4] [border:1px_solid_#e4e9da] rounded-3 flex gap-[26px] items-center py-[29px] [&_h2]:text-[25px] [&_h2]:tracking-[-0.8px] [&_h2]:my-2 [&_h2]:mx-0 [&_p]:text-[11px] [&_p]:text-[#829076] [&_.button]:ml-auto [&_.button]:whitespace-nowrap [&_.eyebrow]:text-[8px] min-[1450px]:max-w-304 compact:mx-8 tablet:px-[23px] tablet:my-[30px] tablet:mx-[22px] tablet:gap-[14px] tablet:flex-wrap tablet:py-[23px] tablet:[&_h2]:text-[22px] tablet:[&_p]:text-[10px] tablet:[&_p]:leading-[1.7] tablet:[&_.button]:ml-16 tablet:[&_.button]:mt-1 tablet:[&_.button]:text-[11px] mobile:gap-3 mobile:p-5 mobile:[&_>_div:nth-child(2)]:[flex:1] mobile:[&_h2]:text-[19px] mobile:[&_.eyebrow]:text-[7px] mobile:[&_p]:text-[9px] mobile:[&_.button]:ml-0 mobile:[&_.button]:w-full">
          <div className="join-illustration w-[85px] relative text-center text-[#578363] shrink-0 [&_>_span]:absolute [&_>_span]:right-0 [&_>_span]:top-0 [&_>_span]:text-[#b7a75f] [&_>_span]:text-[20px] tablet:w-[50px] tablet:[&_svg]:w-[45px]">
            <Sprout size={58} strokeWidth={1.4} />
            <span>✦</span>
          </div>
          <div>
            <div className="eyebrow text-[10px] tracking-[1.35px] font-bold flex items-center gap-[7px] text-brand tablet:text-[8px] tablet:tracking-[1px]">
              PUNYA USAHA MAKANAN?
            </div>
            <h2>Sisa hari ini, peluang baru.</h2>
            <p>Jangkau pelanggan baru dan ubah makanan berlebih jadi berkah.</p>
          </div>
          <button
            className="button primary inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)]"
            onClick={openPartner}
          >
            {user?.role === "partner" ? "Kelola listing" : "Kenalan jadi mitra"}
            <ArrowUpRight size={18} />
          </button>
        </section>
        <footer className="site-footer wrap max-w-300 my-0 mx-auto px-8 flex items-center gap-[25px] [border-top:1px_solid_var(--color-line)] pt-[26px] pb-7 [&_.brand]:text-[25px] [&_>_span]:text-[10px] [&_>_span]:text-[#929987] [&_>_p]:ml-auto [&_>_p]:text-[9px] [&_>_p]:text-[#929987] [&_>_p]:flex [&_>_p]:items-center [&_>_p]:gap-2 min-[1450px]:max-w-320 tablet:px-[22px] tablet:gap-[15px] tablet:flex-wrap tablet:[&_>_p]:w-full tablet:[&_>_p]:m-0 tablet:[&_>_p]:text-[9px] tablet:[&_>_span]:text-[9px]">
          <Link
            className="brand text-[31px] [font-weight:850] tracking-[-1.8px] flex items-center tablet:text-[28px]"
            href="/"
          >
            habisin<span className="brand-dot text-brand">.</span>
          </Link>
          <span>Save food. Cut waste. Feed communities.</span>
          <p>
            Proyek demo · Kelompok 10 PBP B <Leaf size={14} />
          </p>
        </footer>
      </main>
      {notice && (
        <div
          className="toast fixed bottom-[25px] left-[50%] [transform:translateX(-50%)] flex items-center gap-[10px] bg-[var(--color-dark)] text-white [border:1px_solid_#ffffff30] rounded-[10px] py-4 px-5 shadow-[0_5px_30px_#0003] z-[1200] text-[12px] max-w-[calc(100%_-_30px)] w-[max-content] [&_>_button]:text-white [&_>_button]:pl-[10px] mobile:text-[11px] mobile:py-[13px] mobile:px-[15px]"
          role="status"
        >
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
            if (newUser.role === "partner") router.push("/partner/store");
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
          <div className="steps flex flex-col gap-[23px] mb-7 [&_>_div]:flex [&_>_div]:gap-[15px] [&_>_div_>_span]:text-[13px] [&_>_div_>_span]:font-bold [&_>_div_>_span]:bg-[#e8efdd] [&_>_div_>_span]:shrink-0 [&_>_div_>_span]:w-9 [&_>_div_>_span]:h-9 [&_>_div_>_span]:rounded-[50%] [&_>_div_>_span]:grid [&_>_div_>_span]:place-items-center [&_>_div_>_span]:text-brand [&_h3]:text-[13px] [&_h3]:mt-1 [&_h3]:mr-0 [&_h3]:mb-[7px] [&_h3]:ml-0 [&_p]:text-[12px] [&_p]:text-[#8a957f] [&_p]:leading-[1.8]">
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
            className="button primary full inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)] w-full mt-[5px]"
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
          <div className="impact-icon grid place-items-center w-[90px] h-[90px] rounded-[50%] bg-[#eaf0e0] text-brand my-[25px] mx-auto">
            <Sprout size={44} />
          </div>
          <p className="modal-description text-[13px] leading-[1.85] text-[#7d8873] my-4 mx-0">
            Dengan menghabiskan makanan layak santap, kita membantu mengurangi
            sampah makanan dan menghargai sumber daya untuk membuatnya.
          </p>
          <div className="impact-grid flex gap-3 my-5 mx-0 [&_>_div]:[flex:1] [&_>_div]:bg-[#ecf1e4] [&_>_div]:[border:1px_solid_#dfe6d7] [&_>_div]:rounded-[10px] [&_>_div]:text-center [&_>_div]:py-[23px] [&_>_div]:px-[10px] [&_strong]:block [&_strong]:text-[28px] [&_strong]:text-brand [&_span]:block [&_span]:text-[10px] [&_span]:text-[#859478] [&_span]:mt-[9px]">
            <div>
              <strong>0,5 kg</strong>
              <span>Asumsi berat per porsi</span>
            </div>
            <div>
              <strong>1,25 kg</strong>
              <span>Estimasi CO₂e per porsi</span>
            </div>
          </div>
          <p className="fine-print text-[10px] leading-[1.8] text-[#939b88] my-[15px] mx-0">
            Ilustrasi kalkulator: berat makanan × 2,5 kg CO₂e. Ini estimasi
            demo, bukan pengukuran dampak aktual. Pesanan demo tidak dihitung
            sebagai makanan terselamatkan.
          </p>
          <button
            className="button primary full inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)] w-full mt-[5px]"
            onClick={() => setPanel(null)}
          >
            Mulai dari makananmu
            <Leaf size={17} />
          </button>
        </Modal>
      )}
      {panel === "partner" && user?.role === "partner" && (
        <PartnerListings
          onClose={() => setPanel(null)}
          onCatalogChange={updateCatalog}
        />
      )}
      {panel === "partner" && user?.role !== "partner" && (
        <Modal
          title={
            user?.role === "admin" ? "Dasbor admin" : "Tumbuh bersama HABISIN."
          }
          onClose={() => setPanel(null)}
        >
          <div className="impact-icon grid place-items-center w-[90px] h-[90px] rounded-[50%] bg-[#eaf0e0] text-brand my-[25px] mx-auto">
            <Users size={40} />
          </div>
          {user && user.role !== "buyer" ? (
            <>
              <p className="success p-3 text-[12px] leading-[1.7] rounded-[7px] bg-[#e8f1e1] text-[#477543]">
                Kamu masuk sebagai {user.role === "admin" ? "admin" : "mitra"}.
                Akses ini diverifikasi oleh server.
              </p>
              {dashboard ? (
                <>
                  <div className="impact-grid flex gap-3 my-5 mx-0 [&_>_div]:[flex:1] [&_>_div]:bg-[#ecf1e4] [&_>_div]:[border:1px_solid_#dfe6d7] [&_>_div]:rounded-[10px] [&_>_div]:text-center [&_>_div]:py-[23px] [&_>_div]:px-[10px] [&_strong]:block [&_strong]:text-[28px] [&_strong]:text-brand [&_span]:block [&_span]:text-[10px] [&_span]:text-[#859478] [&_span]:mt-[9px]">
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
                  <p className="modal-description text-[13px] leading-[1.85] text-[#7d8873] my-4 mx-0">
                    {dashboard.message}
                  </p>
                </>
              ) : (
                <p role="status">{dashboardError || "Memuat dasbor…"}</p>
              )}
            </>
          ) : (
            <>
              <p className="modal-description text-[13px] leading-[1.85] text-[#7d8873] my-4 mx-0">
                Makanan berlebih punya kesempatan baru. Buat akun mitra untuk
                menjadi bagian dari HABISIN.
              </p>
              <p className="fine-print text-[10px] leading-[1.8] text-[#939b88] my-[15px] mx-0">
                Buat akun mitra, lengkapi profil toko dan konfirmasi lokasinya
                di peta, lalu kelola listing makanan surplusmu.
              </p>
              {!user && (
                <button
                  className="button primary full inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)] w-full mt-[5px]"
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
            className="detail-image h-55 bg-cover bg-center rounded-[10px]"
            style={{ backgroundImage: `url("${selected.image}")` }}
          />
          <div className="detail-heading flex items-center justify-between gap-[10px] mt-5 [&_small]:text-[11px] [&_small]:text-[#8c977f] [&_h3]:text-[20px] [&_h3]:mt-[5px] [&_h3]:tracking-[-0.5px]">
            <div>
              <small>{selected.store}</small>
              <h3>{selected.name}</h3>
            </div>
            <strong className="price text-brand text-[17px] font-bold tracking-[-0.4px] tablet:text-[16px] mobile:text-[13px]">
              {rupiah(selected.price)}
            </strong>
          </div>
          <p className="modal-description text-[13px] leading-[1.85] text-[#7d8873] my-4 mx-0">
            {selected.description}
          </p>
          <div className="detail-info p-[14px] bg-[#eef2e7] rounded-2 flex flex-col gap-[10px] text-[10px] text-[#6f8062] [&_p]:flex [&_p]:items-center [&_p]:gap-2">
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
          <div className="quantity-row flex items-center justify-between my-[22px] mx-0 text-[12px] font-semibold [&_small]:block [&_small]:text-[10px] [&_small]:font-normal [&_small]:text-[#929c85] [&_small]:mt-[5px] [&_input]:w-[70px] [&_input]:[border:1px_solid_#dce4d3] [&_input]:rounded-[6px] [&_input]:bg-[white] [&_input]:p-[10px] [&_input]:text-brand">
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
          <div className="total-row flex justify-between pt-[18px] [border-top:1px_solid_var(--color-line)] [&_strong]:text-[20px] [&_strong]:text-brand">
            <span>Total</span>
            <strong>{rupiah(selected.price * quantity)}</strong>
          </div>
          <p className="fine-print text-[10px] leading-[1.8] text-[#939b88] my-[15px] mx-0">
            Simulasi pembayaran demo. Tidak ada tagihan atau transaksi uang
            sungguhan.
          </p>
          {orderError && (
            <p
              className="error p-3 text-[12px] leading-[1.7] rounded-[7px] bg-[#fbeae4] text-[#a34337]"
              role="alert"
            >
              {orderError}
            </p>
          )}
          {user && user.role !== "buyer" && (
            <p className="error p-3 text-[12px] leading-[1.7] rounded-[7px] bg-[#fbeae4] text-[#a34337]">
              Gunakan akun pembeli untuk memesan makanan.
            </p>
          )}
          <button
            className="button primary full inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)] w-full mt-[5px]"
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
          <div className="ticket text-center bg-[#edf3e4] [border:1px_dashed_#b6c9a7] rounded-[13px] py-[25px] px-[15px] [&_>_p:first-of-type]:text-[9px] [&_>_p:first-of-type]:tracking-[2px] [&_>_p:first-of-type]:text-[#839777] [&_>_strong]:block [&_>_strong]:text-[42px] [&_>_strong]:tracking-[8px] [&_>_strong]:mt-[10px] [&_>_strong]:mr-0 [&_>_strong]:mb-5 [&_>_strong]:ml-0 [&_>_strong]:text-brand [&_h3]:mb-[10px] [&_h3]:text-[16px] [&_>_span]:text-[12px] [&_>_span]:text-[#839477] [&_hr]:[border:0] [&_hr]:[border-top:1px_dashed_#c5d4b6] [&_hr]:my-[25px] [&_hr]:mx-0 [&_p]:text-[12px] [&_p]:my-[10px] [&_p]:mx-0 [&_p]:text-[#638350] [&_small]:text-[10px] [&_small]:text-[#839477]">
            <span className="ticket-check w-[55px] h-[55px] rounded-[50%] bg-brand text-white grid place-items-center mt-0 mr-auto mb-5 ml-auto">
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
          <p className="fine-print text-[10px] leading-[1.8] text-[#939b88] my-[15px] mx-0">
            Tiket demo tersimpan di Pesanan saya. Verifikasi kasir belum
            tersedia pada demo ini.
          </p>
          <button
            className="button primary full inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)] w-full mt-[5px]"
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
            <p className="modal-description text-[13px] leading-[1.85] text-[#7d8873] my-4 mx-0">
              Memuat pesanan…
            </p>
          ) : orders.length === 0 ? (
            <div className="empty-state flex flex-col items-center justify-center gap-4 text-center py-[55px] px-5 text-[#69815e] bg-[#f2f5ec] [border:1px_dashed_#d6dfca] rounded-3 [&_h3]:text-[18px] [&_p]:text-[12px] [&_p]:leading-[1.7] [&_p]:text-[#849477]">
              <ShoppingBag size={35} />
              <h3>Petualangan enakmu dimulai di sini.</h3>
              <p>Belum ada pesanan. Yuk, selamatkan porsi pertamamu.</p>
              <button
                className="button primary inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)]"
                onClick={() => setPanel(null)}
              >
                Jelajahi makanan
              </button>
            </div>
          ) : (
            <div className="order-list flex flex-col gap-[14px]">
              {orders.map((order) => (
                <div
                  className="order-item p-[15px] [border:1px_solid_#dfe6d6] rounded-[9px] bg-[white] [&_p]:text-[10px] [&_p]:text-[#8a967e] [&_p]:my-[9px] [&_p]:mx-0 [&_>_small]:text-[9px] [&_>_small]:text-[#8a967e]"
                  key={order.id}
                >
                  <div className="order-heading flex justify-between gap-[10px] text-[12px] items-center">
                    <strong>{order.listing.name}</strong>
                    <span
                      className={
                        order.status === "cancelled"
                          ? "cancelled-label text-[8px] py-[5px] px-[7px] rounded-1 bg-[#f1e8e4] text-[#9a7d6f]"
                          : "success-label text-[8px] py-[5px] px-[7px] rounded-1 bg-[#eaf3e2] text-[#618348]"
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
                    <div className="order-actions flex justify-between items-center mt-[10px]">
                      <button
                        className="text-button inline-flex gap-2 items-center text-brand text-[11px] font-semibold py-[6px] px-0"
                        onClick={() => {
                          setPanel(null);
                          setTicket(order);
                        }}
                      >
                        Tiket {order.code}
                        <Ticket size={15} />
                      </button>
                      <button
                        className="cancel-button text-[10px] text-[#ac7462] p-2"
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
            <p
              className="error p-3 text-[12px] leading-[1.7] rounded-[7px] bg-[#fbeae4] text-[#a34337]"
              role="alert"
            >
              {orderError}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
