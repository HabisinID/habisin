"use client";
import { isActiveReservation } from "@/lib/reservation";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  Suspense,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import LandingPage, {
  LandingHeader,
  PublicSearchParams,
} from "@/components/landing-page";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  Leaf,
  LogOut,
  ShoppingBag,
  Sprout,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { Auth, Profile } from "@/components/account";
import Modal from "@/components/modal";
import AuthenticatedDiscovery from "@/components/authenticated-discovery";
import FoodListingDetail from "@/components/food-listing-detail";
import { URGENT_WINDOW } from "@/lib/listing-time";
import PartnerListings from "@/components/partner-listings";
import BuyerHeader from "@/components/buyer-header";
import HabisinLogo from "@/components/habisin-logo";
import BuyerTicket from "@/components/buyer-ticket";
import CartPanel from "@/components/cart-panel";
import PartnerDashboard from "@/components/partner-dashboard";
import { useCart } from "@/lib/cart";
import {
  api,
  pickup,
  rupiah,
  type Listing,
  type Reservation,
  type User,
} from "@/lib/api";
import demo from "@/lib/demo.json";
import ListingDeepLink from "@/components/listing-deep-link";
import { useCatalog } from "@/hooks/use-catalog";
import { eligible } from "@/lib/discovery";
import { useBrowserLocation } from "@/hooks/use-browser-location";
function previewCatalog(): Listing[] {
  const now = Date.now();
  return demo.map((item) => ({
    ...item,
    pickup_start: new Date(now).toISOString(),
    pickup_end: new Date(now + 4 * 3600000).toISOString(),
  }));
}

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
type Panel =
  | "login"
  | "register"
  | "profile"
  | "orders"
  | "cart"
  | "how"
  | "impact"
  | "partner"
  | null;

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const guestExplore = pathname === "/jelajahi";
  const [user, setUser] = useState<User | null>(null);
  const {
    items,
    setItems,
    online,
    hasServerData,
    loaded,
    loading: catalogLoading,
    error: catalogError,
    now,
    refresh,
  } = useCatalog("listings", previewCatalog, true);
  const [panel, setPanel] = useState<Panel>(null);
  const [registrationRole, setRegistrationRole] = useState<"buyer" | "partner">(
    "buyer",
  );
  const [selected, setSelected] = useState<Listing | null>(null);
  const [policyRevision, setPolicyRevision] = useState(0);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const catalogScroll = useRef(0);
  const previousDetail = useRef(false);

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
  const [buyerQuery, setBuyerQuery] = useState("");
  const [buyerFavorites, setBuyerFavorites] = useState(false);
  const [partnerRevision, setPartnerRevision] = useState(0);
  const [partnerCopy, setPartnerCopy] = useState(false);
  const [partnerStart, setPartnerStart] = useState(false);
  const cart = useCart(user?.role === "buyer" ? user.id : undefined);
  const [orders, setOrders] = useState<Reservation[]>([]);
  const [ordersHistory, setOrdersHistory] = useState(false);
  const shownOrders = orders.filter((order) =>
    ordersHistory
      ? !isActiveReservation(order, now)
      : isActiveReservation(order, now),
  );
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const { origin, location, locating, recenterKey, locate } =
    useBrowserLocation(setNotice);
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
  }, []);
  const ticketId = ticket?.id;
  useEffect(() => {
    if (!user || user.role !== "buyer" || (panel !== "orders" && !ticketId))
      return;
    const controller = new AbortController();
    const refreshOrders = () => {
      void api<Reservation[]>(
        "reservations",
        "GET",
        undefined,
        controller.signal,
      )
        .then((rows) => {
          if (controller.signal.aborted) return;
          setOrders(rows);
          setTicket((current) =>
            current
              ? rows.find((row) => row.id === current.id) || current
              : null,
          );
        })
        .catch((e: Error) => {
          if (!controller.signal.aborted) setOrderError(e.message);
        });
    };
    window.addEventListener("focus", refreshOrders);
    const timer = setInterval(refreshOrders, 15000);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refreshOrders);
      clearInterval(timer);
    };
  }, [user, panel, ticketId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const detail =
    selected && (items.find((row) => row.id === selected.id) || selected);
  const selectedAvailable = selected
    ? online &&
      eligible(
        items.find((row) => row.id === selected.id) || {
          ...selected,
          active: false,
        },
        now,
      )
    : false;
  useEffect(() => {
    if (selected && !previousDetail.current) window.scrollTo(0, 0);
    if (!selected && previousDetail.current) {
      window.scrollTo(0, catalogScroll.current);
      requestAnimationFrame(() => {
        if (detailTrigger.current?.isConnected)
          detailTrigger.current.focus({ preventScroll: true });
        else document.getElementById("explore")?.focus({ preventScroll: true });
      });
    }
    previousDetail.current = !!selected;
  }, [selected, user]);
  const closeDetail = useCallback(() => {
    if (busy) return;
    setSelected(null);
    if (new URLSearchParams(window.location.search).has("listing")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("listing");
      router.replace(`${url.pathname}${url.search}${url.hash}`, {
        scroll: false,
      });
    }
  }, [busy, router]);
  useEffect(() => {
    if (!user || !selected) return;
    const navigate = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('a[href="#explore"]')
      ) {
        event.preventDefault();
        closeDetail();
      }
    };
    document.addEventListener("click", navigate);
    return () => document.removeEventListener("click", navigate);
  }, [user, selected, closeDetail]);
  const selectItem = useCallback((item: Listing) => {
    detailTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    catalogScroll.current = window.scrollY;
    setQuantity(1);
    setOrderError("");
    setSelected(item);
  }, []);
  function toggleSaved(id: number) {
    if (!user) {
      setRegistrationRole("buyer");
      setPanel("login");
      return;
    }
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
  async function showOrders() {
    if (!user) {
      setPanel("login");
      return;
    }
    setPanel("orders");
    setOrdersHistory(false);
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
    if (!selectedAvailable || catalogLoading) return;
    if (!user) {
      setRegistrationRole("buyer");
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
      setPolicyRevision((n) => n + 1);
      setTicket(order);
      setSelected(null);
      if (new URLSearchParams(window.location.search).has("listing"))
        router.replace(pathname, { scroll: false });
      refresh();
      setItems((current) =>
        current.map((item) =>
          item.id === order.listing.id
            ? { ...item, stock: order.listing.stock }
            : item,
        ),
      );
    } catch (e) {
      setOrderError((e as Error).message);
      setPolicyRevision((n) => n + 1);
      refresh();
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
      setTicket((current) => (current?.id === order.id ? updated : current));
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setItems((current) =>
        current.map((item) =>
          item.id === updated.listing.id ? updated.listing : item,
        ),
      );
      setPolicyRevision((n) => n + 1);
      setOrdersHistory(true);
      setNotice("Pesanan dibatalkan. Stok sudah dikembalikan.");
      refresh();
    } catch (e) {
      setOrderError((e as Error).message);
      setPolicyRevision((n) => n + 1);
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    try {
      await api("auth/logout", "POST");
      setSelected(null);
      setPolicyRevision((n) => n + 1);
      previousDetail.current = false;
      setUser(null);
      setOrders([]);
      setDashboard(null);
      setNotice("Kamu berhasil keluar.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function openPartner() {
    if (!user) {
      setRegistrationRole("partner");
      setPanel("login");
      return;
    }
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
    setPartnerRevision((n) => n + 1);
    refresh();
    setItems((current) => {
      const remaining = current.filter((row) => row.id !== id);
      return item?.active && new Date(item.pickup_end).getTime() > Date.now()
        ? [...remaining, item]
        : remaining;
    });
  }
  function buyerNavigate(destination: string) {
    if (!user && destination !== "explore") {
      setRegistrationRole("buyer");
      setPanel("login");
      return;
    }
    setTicket(null);
    closeDetail();
    if (destination === "cart") {
      setPanel("cart");
      refresh();
    } else if (destination === "orders") void showOrders();
    else {
      setPanel(null);
      setBuyerFavorites(destination === "favorites");
      if (destination === "explore") setBuyerQuery("");
    }
  }
  const buyerHeader =
    user?.role === "buyer" || !user ? (
      <BuyerHeader
        user={user}
        query={buyerQuery}
        onQuery={(value) => {
          setBuyerQuery(value);
          setPanel(null);
          setTicket(null);
          closeDetail();
        }}
        location={location}
        locating={locating}
        onLocate={locate}
        active={
          ticket || panel === "orders"
            ? "orders"
            : panel === "cart"
              ? "cart"
              : buyerFavorites
                ? "favorites"
                : "explore"
        }
        onNavigate={buyerNavigate}
        cartCount={cart.items.reduce((n, r) => n + r.quantity, 0)}
        onAccount={() => {
          setTicket(null);
          setPanel("profile");
        }}
        onLogout={signOut}
        onLogin={() => {
          setRegistrationRole("buyer");
          setPanel("login");
        }}
        onRegister={() => {
          setRegistrationRole("buyer");
          setPanel("register");
        }}
      />
    ) : null;
  return (
    <>
      <Suspense fallback={null}>
        {guestExplore && <PublicSearchParams onQuery={setBuyerQuery} />}
        <ListingDeepLink
          items={items}
          now={now}
          ready={loaded && online && !catalogLoading}
          onSelect={selectItem}
          onMissing={setNotice}
        />
      </Suspense>
      {/* <div className="announcement">
        <Leaf size={13} />
        <span>Makanan baik layak mendapat kesempatan kedua.</span>
        <span className="announcement-link">
          Yuk, mulai dari piringmu <ArrowUpRight size={13} />
        </span>
      </div> */}
      {user?.role === "buyer" || (!user && (guestExplore || !!selected)) ? (
        panel === "cart" || panel === "orders" || ticket ? null : (
          buyerHeader
        )
      ) : user?.role === "partner" ? null : !user ? (
        <LandingHeader
          location={location}
          locating={locating}
          onLocate={locate}
          onLogin={() => {
            setRegistrationRole("buyer");
            setPanel("login");
          }}
          onRegister={() => {
            setRegistrationRole("buyer");
            setPanel("register");
          }}
        />
      ) : (
        <header className="header h-22 bg-[#fafaf6f5] [border-bottom:1px_solid_var(--color-line)] [&_nav]:flex [&_nav]:items-center [&_nav]:gap-[30px] [&_nav]:h-full [&_nav]:text-[13px] [&_nav_>_a]:h-full [&_nav_>_a]:flex [&_nav_>_a]:items-center [&_nav_>_a]:gap-[7px] [&_nav_>_a]:relative [&_nav_>_a]:text-[#6a746c] [&_nav_>_button]:h-full [&_nav_>_button]:flex [&_nav_>_button]:items-center [&_nav_>_button]:gap-[7px] [&_nav_>_button]:relative [&_nav_>_button]:text-[#6a746c] [&_nav_.nav-active]:text-brand [&_nav_.nav-active]:font-bold compact:[&_nav]:gap-[18px] tablet:h-18 tablet:[&_nav]:hidden">
          <div className="header-inner max-w-300 py-0 px-8 h-full m-auto flex items-center justify-between gap-[35px] min-[1450px]:max-w-320 compact:gap-5 tablet:py-0 tablet:px-[22px]">
            <HabisinLogo />
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
      )}

      <main>
        {user?.role === "partner" && !selected ? (
          <div hidden={panel === "partner" || panel === "profile"}>
            <PartnerDashboard
              user={user}
              now={now}
              revision={partnerRevision}
              onListings={() => {
                setPartnerStart(false);
                setPartnerCopy(false);
                setPanel("partner");
              }}
              onAdd={() => {
                setPartnerStart(true);
                setPartnerCopy(false);
                setPanel("partner");
              }}
              onCopy={() => {
                setPartnerStart(true);
                setPartnerCopy(true);
                setPanel("partner");
              }}
              onAccount={() => setPanel("profile")}
              onLogout={signOut}
              onChanged={updateCatalog}
            />
          </div>
        ) : user || guestExplore || selected ? (
          <>
            <div hidden={!!selected}>
              <AuthenticatedDiscovery
                items={user || hasServerData ? items : []}
                now={now}
                user={user}
                origin={origin}
                location={location}
                locating={locating}
                recenterKey={recenterKey}
                online={online}
                hasServerData={hasServerData}
                loading={catalogLoading}
                error={catalogError}
                saved={user ? saved : []}
                onSave={toggleSaved}
                onSelect={selectItem}
                onRefresh={refresh}
                onLocate={locate}
                onOrders={showOrders}
                onPartner={openPartner}
                query={buyerQuery}
                onQueryChange={setBuyerQuery}
                savedOnly={!!user && buyerFavorites}
                onSavedOnlyChange={setBuyerFavorites}
              />
            </div>
            {selected && detail && (
              <FoodListingDetail
                item={detail}
                now={now}
                user={user}
                origin={origin}
                available={selectedAvailable}
                online={online}
                loading={catalogLoading}
                quantity={quantity}
                busy={busy}
                error={orderError}
                policyRevision={policyRevision}
                onQuantity={setQuantity}
                onBook={book}
                onClose={closeDetail}
                onOrders={showOrders}
                onAddToCart={() => {
                  if (!user) {
                    setRegistrationRole("buyer");
                    setPanel("login");
                    return;
                  }
                  if (!detail || user.role !== "buyer") return;
                  cart.update((rows) => {
                    const existing = rows.find((r) => r.item.id === detail.id);
                    return existing
                      ? rows.map((r) =>
                          r.item.id === detail.id
                            ? {
                                ...r,
                                item: detail,
                                quantity: Math.min(
                                  10,
                                  detail.stock,
                                  r.quantity + quantity,
                                ),
                                selected: true,
                              }
                            : r,
                        )
                      : [...rows, { item: detail, quantity, selected: true }];
                  });
                  setNotice(`${detail.name} dimasukkan ke keranjang.`);
                }}
              />
            )}
          </>
        ) : (
          <LandingPage
            items={items}
            now={now}
            origin={origin}
            online={online}
            verified={hasServerData}
            loading={catalogLoading}
            onRefresh={refresh}
            onSelect={(item) => router.push(`/jelajahi?listing=${item.id}`)}
            onSave={() => {
              setRegistrationRole("buyer");
              setPanel("login");
            }}
            onPartner={openPartner}
            onLogin={() => {
              setRegistrationRole("buyer");
              setPanel("login");
            }}
            onRegister={() => {
              setRegistrationRole("buyer");
              setPanel("register");
            }}
          />
        )}
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
        <Profile
          user={user}
          onUser={(newUser) => {
            setUser(newUser);
            if (!newUser) {
              setSelected(null);
              setOrders([]);
              previousDetail.current = false;
            }
          }}
          onClose={() => setPanel(null)}
        />
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
          userId={user.id}
          startWithCreate={partnerStart}
          startWithCopy={partnerCopy}
          onViewListing={(item) => {
            setPanel(null);
            selectItem(item);
          }}
          onAccount={() => setPanel("profile")}
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
      {panel === "cart" && user?.role === "buyer" && (
        <Modal title="Keranjang" fullscreen onClose={() => setPanel(null)}>
          <div className="h-dvh overflow-auto">
            {buyerHeader}
            <CartPanel
              userId={user.id}
              items={items}
              now={now}
              loading={catalogLoading}
              online={online}
              onRefresh={refresh}
              onPaid={(result) => {
                setPanel(null);
                setTicket(result[0]);
                setPolicyRevision((n) => n + 1);
                setNotice(`${result.length} tiket tersimpan di Pesanan saya.`);
              }}
            />
          </div>
        </Modal>
      )}
      {ticket && (
        <Modal
          title="Makananmu sudah dipesan!"
          fullscreen
          onClose={() => setTicket(null)}
        >
          <div className="h-dvh overflow-auto">
            {buyerHeader}
            <BuyerTicket
              order={ticket}
              now={now}
              busy={busy}
              error={orderError}
              onClose={() => setTicket(null)}
              onOrders={() => {
                setTicket(null);
                void showOrders();
              }}
              onCancel={() => void cancel(ticket)}
            />
          </div>
        </Modal>
      )}
      {panel === "orders" && (
        <Modal title="Pesanan saya" fullscreen onClose={() => setPanel(null)}>
          <div className="h-dvh overflow-auto bg-[#fbf7ec]">
            {buyerHeader}
            <div className="mx-auto max-w-5xl p-6">
              <h1 className="mb-6 text-2xl font-bold">Pesanan saya</h1>
              <button
                className="mb-4 min-h-11 text-[#3e6b26]"
                aria-label="Tutup"
                onClick={() => setPanel(null)}
              >
                ← Jelajahi
              </button>
              <div
                className="mb-5 flex gap-2"
                aria-label="Filter pesanan pembeli"
              >
                <button
                  className="min-h-11 rounded-lg border px-4"
                  aria-pressed={!ordersHistory}
                  onClick={() => setOrdersHistory(false)}
                >
                  Aktif
                </button>
                <button
                  className="min-h-11 rounded-lg border px-4"
                  aria-pressed={ordersHistory}
                  onClick={() => setOrdersHistory(true)}
                >
                  Riwayat
                </button>
              </div>
              {ordersLoading ? (
                <p className="modal-description text-[13px] leading-[1.85] text-[#7d8873] my-4 mx-0">
                  Memuat pesanan…
                </p>
              ) : shownOrders.length === 0 ? (
                <div className="empty-state flex flex-col items-center justify-center gap-4 text-center py-[55px] px-5 text-[#69815e] bg-[#f2f5ec] [border:1px_dashed_#d6dfca] rounded-3 [&_h3]:text-[18px] [&_p]:text-[12px] [&_p]:leading-[1.7] [&_p]:text-[#849477]">
                  <ShoppingBag size={35} />
                  <h3>Petualangan enakmu dimulai di sini.</h3>
                  <p>
                    {ordersHistory
                      ? "Belum ada riwayat pesanan."
                      : "Belum ada pesanan aktif. Yuk, selamatkan porsi pertamamu."}
                  </p>
                  <button
                    className="button primary inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-white hover:bg-[#174c36] hover:[transform:translateY(-1px)]"
                    onClick={() => setPanel(null)}
                  >
                    Jelajahi makanan
                  </button>
                </div>
              ) : (
                <div className="order-list flex flex-col gap-[14px]">
                  {shownOrders.map((order) => (
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
                          {order.status === "cancelled"
                            ? "Dibatalkan"
                            : !isActiveReservation(order, now)
                              ? "Kedaluwarsa"
                              : "Dipesan"}
                        </span>
                      </div>
                      <p>
                        {order.quantity} porsi · {rupiah(order.total)} ·{" "}
                        {order.listing.store}
                      </p>
                      <small>
                        Ambil sebelum {pickup(order.listing.pickup_end)} WIB
                      </small>
                      {!isActiveReservation(order, now) && (
                        <button
                          className="min-h-11 text-[#3e6b26]"
                          onClick={() => {
                            setPanel(null);
                            setTicket(order);
                          }}
                        >
                          Tiket {order.code}
                        </button>
                      )}
                      {order.cancellation_note && (
                        <p>Alasan mitra: {order.cancellation_note}</p>
                      )}
                      {isActiveReservation(order, now) && (
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
                            disabled={
                              busy ||
                              order.can_cancel === false ||
                              Date.parse(order.listing.pickup_end) - now <
                                URGENT_WINDOW
                            }
                            onClick={() => cancel(order)}
                          >
                            Batalkan
                          </button>
                        </div>
                      )}
                      {order.status === "reserved" &&
                        (order.can_cancel === false ||
                          Date.parse(order.listing.pickup_end) - now <
                            URGENT_WINDOW) && (
                          <p>
                            {order.cancellation_reason ||
                              "Tidak bisa dibatalkan: waktu pengambilan tersisa kurang dari 30 menit atau sudah berakhir."}
                          </p>
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
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
