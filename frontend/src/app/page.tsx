"use client";

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
import { ArrowRight, Compass, Leaf, Sprout, Users, X } from "lucide-react";
import { Auth, Profile } from "@/components/account";
import Modal from "@/components/modal";
import AuthenticatedDiscovery from "@/components/authenticated-discovery";
import FoodListingDetail from "@/components/food-listing-detail";
import PartnerListings from "@/components/partner-listings";
import BuyerHeader from "@/components/buyer-header";
import SiteHeader from "@/components/site-header";
import { orderApi } from "@/lib/orders";
import { api, type Listing, type User } from "@/lib/api";
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
  | "how"
  | "impact"
  | "partner"
  | null;

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const guestExplore = pathname === "/jelajahi";
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (
      pathname !== "/" ||
      new URLSearchParams(window.location.search).has("listing")
    )
      return;
    if (user?.role === "partner") router.replace("/partner");
    else if (user?.role === "admin") router.replace("/admin");
  }, [user, router, pathname]);
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
  const [partnerCopy] = useState(false);
  const [partnerStart] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const { origin, location, locating, recenterKey, locate } =
    useBrowserLocation(setNotice);
  const [note, setNote] = useState("");
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
    setNote("");
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
  function showOrders() {
    if (!user) {
      setPanel("login");
      return;
    }
    router.push("/pesanan");
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
      const order = await orderApi.create(selected!.id, quantity, note);
      setPolicyRevision((n) => n + 1);
      // Modul 7: the summary is its own page (/pesanan/:id), not a modal.
      router.push(`/pesanan/${order.id}`);
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
    if (user.role === "partner" || user.role === "admin") {
      router.push(user.role === "partner" ? "/partner" : "/admin");
      return;
    }
    setDashboardError("");
    setPanel("partner");
  }
  function updateCatalog(item: Listing | null, id: number) {
    refresh();
    setItems((current) => {
      const remaining = current.filter((row) => row.id !== id);
      return item?.active && new Date(item.pickup_end).getTime() > Date.now()
        ? [...remaining, item]
        : remaining;
    });
  }
  const buyerHeader =
    user?.role === "buyer" || !user ? (
      <BuyerHeader
        user={user}
        query={buyerQuery}
        onQuery={(value) => {
          setBuyerQuery(value);
          setPanel(null);
          closeDetail();
        }}
        location={location}
        locating={locating}
        onLocate={locate}
        active="explore"
        onAccount={() => setPanel("profile")}
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
        buyerHeader
      ) : user?.role === "partner" ? null : !user ? (
        <LandingHeader
          location={location}
          locating={locating}
          onLocate={locate}
          onLogin={() => setPanel("login")}
          onRegister={() => {
            setRegistrationRole("buyer");
            setPanel("register");
          }}
        />
      ) : (
        <SiteHeader
          nav={[
            { label: "Jelajahi", href: "/jelajahi" },
            { label: "Dasbor admin", onClick: openPartner },
          ]}
          actions={
            <>
              <button onClick={() => setPanel("profile")}>Akun</button>
              <button onClick={signOut}>Keluar</button>
            </>
          }
        />
      )}

      <main>
        {user?.role === "partner" && !guestExplore && !selected ? (
          <p role="status" className="p-6">
            Membuka ruang kerja mitra…
          </p>
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
                note={note}
                onNote={setNote}
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
          className="toast fixed bottom-[25px] left-[50%] [transform:translateX(-50%)] flex items-center gap-[10px] bg-inverse text-on-inverse [border:1px_solid_#ffffff30] rounded-[10px] py-4 px-5 shadow-[0_5px_30px_#0003] z-[1200] text-[12px] max-w-[calc(100%_-_30px)] w-[max-content] [&_>_button]:text-on-inverse [&_>_button]:pl-[10px] mobile:text-[11px] mobile:py-[13px] mobile:px-[15px]"
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
            if (newUser.role === "partner") router.push("/partner");
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
          <div className="steps flex flex-col gap-[23px] mb-7 [&_>_div]:flex [&_>_div]:gap-[15px] [&_>_div_>_span]:text-[13px] [&_>_div_>_span]:font-bold [&_>_div_>_span]:bg-[var(--color-light)] [&_>_div_>_span]:shrink-0 [&_>_div_>_span]:w-9 [&_>_div_>_span]:h-9 [&_>_div_>_span]:rounded-[50%] [&_>_div_>_span]:grid [&_>_div_>_span]:place-items-center [&_>_div_>_span]:text-brand [&_h3]:text-[13px] [&_h3]:mt-1 [&_h3]:mr-0 [&_h3]:mb-[7px] [&_h3]:ml-0 [&_p]:text-[12px] [&_p]:text-[var(--color-muted)] [&_p]:leading-[1.8]">
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
            className="button primary full inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-on-brand hover:bg-[var(--color-brand)] hover:[transform:translateY(-1px)] w-full mt-[5px]"
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
          <div className="impact-icon grid place-items-center w-[90px] h-[90px] rounded-[50%] bg-[var(--color-light)] text-brand my-[25px] mx-auto">
            <Sprout size={44} />
          </div>
          <p className="modal-description text-[13px] leading-[1.85] text-[var(--color-muted)] my-4 mx-0">
            Dengan menghabiskan makanan layak santap, kita membantu mengurangi
            sampah makanan dan menghargai sumber daya untuk membuatnya.
          </p>
          <div className="impact-grid flex gap-3 my-5 mx-0 [&_>_div]:[flex:1] [&_>_div]:bg-[var(--color-light)] [&_>_div]:[border:1px_solid_var(--color-line)] [&_>_div]:rounded-[10px] [&_>_div]:text-center [&_>_div]:py-[23px] [&_>_div]:px-[10px] [&_strong]:block [&_strong]:text-[28px] [&_strong]:text-brand [&_span]:block [&_span]:text-[10px] [&_span]:text-[var(--color-border)] [&_span]:mt-[9px]">
            <div>
              <strong>0,5 kg</strong>
              <span>Asumsi berat per porsi</span>
            </div>
            <div>
              <strong>1,25 kg</strong>
              <span>Estimasi CO₂e per porsi</span>
            </div>
          </div>
          <p className="fine-print text-[10px] leading-[1.8] text-[var(--color-muted)] my-[15px] mx-0">
            Ilustrasi kalkulator: berat makanan × 2,5 kg CO₂e. Ini estimasi
            demo, bukan pengukuran dampak aktual. Pesanan demo tidak dihitung
            sebagai makanan terselamatkan.
          </p>
          <button
            className="button primary full inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-on-brand hover:bg-[var(--color-brand)] hover:[transform:translateY(-1px)] w-full mt-[5px]"
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
          <div className="impact-icon grid place-items-center w-[90px] h-[90px] rounded-[50%] bg-[var(--color-light)] text-brand my-[25px] mx-auto">
            <Users size={40} />
          </div>
          {user && user.role !== "buyer" ? (
            <>
              <p className="success p-3 text-[12px] leading-[1.7] rounded-[7px] bg-[var(--color-light)] text-[var(--color-brand)]">
                Kamu masuk sebagai {user.role === "admin" ? "admin" : "mitra"}.
                Akses ini diverifikasi oleh server.
              </p>
              {dashboard ? (
                <>
                  <div className="impact-grid flex gap-3 my-5 mx-0 [&_>_div]:[flex:1] [&_>_div]:bg-[var(--color-light)] [&_>_div]:[border:1px_solid_var(--color-line)] [&_>_div]:rounded-[10px] [&_>_div]:text-center [&_>_div]:py-[23px] [&_>_div]:px-[10px] [&_strong]:block [&_strong]:text-[28px] [&_strong]:text-brand [&_span]:block [&_span]:text-[10px] [&_span]:text-[var(--color-border)] [&_span]:mt-[9px]">
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
                  <p className="modal-description text-[13px] leading-[1.85] text-[var(--color-muted)] my-4 mx-0">
                    {dashboard.message}
                  </p>
                </>
              ) : (
                <p role="status">{dashboardError || "Memuat dasbor…"}</p>
              )}
            </>
          ) : (
            <>
              <p className="modal-description text-[13px] leading-[1.85] text-[var(--color-muted)] my-4 mx-0">
                Makanan berlebih punya kesempatan baru. Buat akun mitra untuk
                menjadi bagian dari HABISIN.
              </p>
              <p className="fine-print text-[10px] leading-[1.8] text-[var(--color-muted)] my-[15px] mx-0">
                Buat akun mitra, lengkapi profil toko dan konfirmasi lokasinya
                di peta, lalu kelola listing makanan surplusmu.
              </p>
              {!user && (
                <button
                  className="button primary full inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-on-brand hover:bg-[var(--color-brand)] hover:[transform:translateY(-1px)] w-full mt-[5px]"
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
    </>
  );
}
