"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import ProfilePictureInput, {
  pictureFormData,
  pictureRequestBody,
} from "./profile-picture";
import Modal from "./modal";
import BuyerReviewsSection from "./buyer-reviews";
import {
  ProfileIdentity,
  ProfileSectionHeading,
  profilePrimary,
} from "./profile-ui";
import { api, type User } from "@/lib/api";

export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <input
        {...props}
        type={visible ? "text" : "password"}
        style={{ paddingRight: "3rem" }}
      />
      <button
        type="button"
        aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-[7px] text-[var(--color-muted)] hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
      >
        {visible ? (
          <EyeOff size={18} aria-hidden="true" />
        ) : (
          <Eye size={18} aria-hidden="true" />
        )}
      </button>
    </span>
  );
}

export function Auth({
  initial,
  initialRole = "buyer",
  onClose,
  onUser,
}: {
  initial: "login" | "register";
  initialRole?: "buyer" | "partner";
  onClose: () => void;
  onUser: (user: User) => void;
}) {
  const [mode, setMode] = useState(initial);
  const [username, setUsername] = useState("");
  const [availability, setAvailability] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode !== "register" || !username) return;
    let active = true;
    const timer = setTimeout(() => {
      api<{ available: boolean; valid: boolean }>(
        `auth/username?username=${encodeURIComponent(username)}`,
      )
        .then((data) => {
          if (active)
            setAvailability(
              !data.valid
                ? "Gunakan 3–30 huruf, angka, atau underscore."
                : data.available
                  ? "Username tersedia ✓"
                  : "Username sudah digunakan.",
            );
        })
        .catch(() => {
          if (active) setAvailability("Belum bisa memeriksa username.");
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username, mode]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "register" && values.password !== values.password_confirm) {
        throw new Error("Konfirmasi password harus sama dengan password.");
      }
      onUser(await api<User>(`auth/${mode}`, "POST", values));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={mode === "login" ? "Login" : "Daftar Akun"} onClose={onClose}>
      <form
        onSubmit={submit}
        className="form flex flex-col gap-[15px] [&_>_label]:flex [&_>_label]:flex-col [&_>_label]:gap-[7px] [&_>_label]:font-semibold [&_>_label]:text-[11px] [&_>_label]:text-muted [&_input:not([type=checkbox])]:w-full [&_input]:[border:1px_solid_var(--color-line)] [&_input]:rounded-[7px] [&_input]:p-3 [&_input]:bg-surface [&_input]:text-dark [&_input]:text-[13px] [&_input]:font-normal [&_select]:w-full [&_select]:[border:1px_solid_var(--color-line)] [&_select]:rounded-[7px] [&_select]:p-3 [&_select]:bg-surface [&_select]:text-dark [&_select]:text-[13px] [&_select]:font-normal [&_small]:text-[10px] [&_small]:min-h-3 [&_small]:font-normal [&_.check-label]:flex-row [&_.check-label]:items-center [&_.check-label]:leading-[1.7]"
      >
        {mode === "register" && (
          <label>
            Nama lengkap
            <input
              name="name"
              required
              maxLength={150}
              autoComplete="name"
              placeholder="Nama kamu"
            />
          </label>
        )}
        <label>
          Username
          <input
            name="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setAvailability("");
            }}
            required
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_]+"
            autoComplete="username"
            placeholder="Username kamu"
          />
          {mode === "register" && (
            <small aria-live="polite">{availability}</small>
          )}
        </label>
        {mode === "register" && (
          <label>
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="kamu@email.com"
            />
          </label>
        )}
        <label>
          Password
          <PasswordInput
            name="password"
            required
            minLength={mode === "register" ? 8 : 1}
            maxLength={128}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            placeholder={
              mode === "register" ? "Minimal 8 karakter" : "Masukkan password"
            }
          />
        </label>
        {mode === "register" && (
          <label>
            Konfirmasi password
            <PasswordInput
              name="password_confirm"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              placeholder="Ulangi password kamu"
            />
          </label>
        )}
        {mode === "register" && (
          <label>
            Daftar sebagai
            <select name="role" defaultValue={initialRole}>
              <option value="buyer">Pembeli</option>
              <option value="partner">Mitra</option>
            </select>
          </label>
        )}
        {error && (
          <p
            className="error p-3 text-[12px] leading-[1.7] rounded-[7px] bg-error-tint text-error"
            role="alert"
          >
            {error}
          </p>
        )}
        <button
          className="button primary full inline-flex items-center justify-center gap-3 rounded-2 py-[13px] px-5 text-[12px] font-semibold min-h-11 [transition:background_0.2s,_transform_0.2s] bg-brand text-on-brand hover:bg-brand-hover hover:[transform:translateY(-1px)] w-full mt-[5px]"
          disabled={busy}
        >
          {busy ? "Sebentar…" : mode === "login" ? "Masuk" : "Buat akun"}
          <ArrowRight size={18} />
        </button>
      </form>
      <p className="auth-switch text-center text-[11px] my-[22px] mx-0 text-muted [&_button]:font-bold [&_button]:text-brand [&_button]:pl-[5px]">
        {mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "Daftar gratis" : "Masuk"}
        </button>
      </p>
      <p className="secure-note flex items-center justify-center gap-[5px] text-[9px] text-muted [border-top:1px_solid_var(--color-line)] pt-[17px] tablet:text-[8px]">
        <ShieldCheck size={15} /> Sesi aman. Password tersimpan terenkripsi satu
        arah.
      </p>
    </Modal>
  );
}

export function Profile({
  user,
  onUser,
  onClose,
}: {
  user: User;
  onUser: (user: User | null) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("profile");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      if (tab === "profile") {
        onUser(
          await api<User>(
            "auth/me",
            "PATCH",
            pictureRequestBody(pictureFormData(form)),
          ),
        );
        setMessage("Profil berhasil disimpan.");
      }
      if (tab === "password") {
        if (data.new_password !== data.new_password_confirm) {
          throw new Error("Konfirmasi password harus sama dengan password baru.");
        }
        await api("auth/password", "POST", data);
        setMessage("Password berhasil diubah.");
        form.reset();
      }
      if (tab === "delete") {
        await api("auth/me", "DELETE", data);
        onUser(null);
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const tabs = [
    ["profile", "Profil", "01"],
    ...(user.role === "buyer" ? [["reviews", "Ulasan saya", "02"]] : []),
    ["password", "Password", user.role === "buyer" ? "03" : "02"],
    ["delete", "Hapus akun", user.role === "buyer" ? "04" : "03"],
  ];
  return (
    <Modal title="Akun kamu" onClose={onClose} wide>
      <div className="grid grid-cols-[230px_minmax(0,1fr)] gap-8 tablet:grid-cols-1 tablet:gap-6">
        <aside className="min-w-0 space-y-5">
          <ProfileIdentity user={user} />
          <nav
            aria-label="Pengaturan akun"
            className={`flex flex-col gap-1 tablet:grid ${user.role === "buyer" ? "tablet:grid-cols-2" : "tablet:grid-cols-3"}`}
          >
            {tabs.map(([key, label, number]) => (
              <button
                type="button"
                key={key}
                aria-pressed={tab === key}
                onClick={() => {
                  setTab(key);
                  setError("");
                  setMessage("");
                }}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-semibold transition-colors tablet:justify-center tablet:px-2 tablet:text-xs ${tab === key ? "bg-light text-brand" : "text-muted hover:bg-surface-2"}`}
              >
                <span
                  aria-hidden="true"
                  className="font-mono text-[10px] opacity-70 tablet:hidden"
                >
                  {number}
                </span>
                {label}
              </button>
            ))}
          </nav>
          <p className="flex items-start gap-2 px-2 text-xs leading-relaxed text-muted tablet:hidden">
            <ShieldCheck size={15} />
            Tempat untuk mengelola identitas dan keamanan akunmu.
          </p>
        </aside>
        {tab === "reviews" ? (
          <BuyerReviewsSection />
        ) : (
        <form
          className="flex min-w-0 flex-col gap-5 [&_label:not(.check-label)]:flex [&_label:not(.check-label)]:flex-col [&_label:not(.check-label)]:gap-2 [&_label]:text-sm [&_label]:font-semibold [&_input:not([type=checkbox]):not([type=file])]:min-h-11 [&_input:not([type=checkbox]):not([type=file])]:w-full [&_input:not([type=checkbox]):not([type=file])]:rounded-lg [&_input:not([type=checkbox]):not([type=file])]:border [&_input:not([type=checkbox]):not([type=file])]:border-border [&_input:not([type=checkbox]):not([type=file])]:bg-surface [&_input:not([type=checkbox]):not([type=file])]:px-3.5 [&_input:not([type=checkbox]):not([type=file])]:py-3 [&_input]:text-sm"
          key={tab}
          onSubmit={submit}
        >
          <ProfileSectionHeading
            letter={tab === "profile" ? "A" : tab === "password" ? "B" : "C"}
            description={
              tab === "profile"
                ? "Biar kami dan mitra lebih mudah mengenalmu."
                : tab === "password"
                  ? "Jaga akunmu tetap aman dengan kata sandi yang kuat."
                  : "Pastikan semua pesananmu sudah selesai sebelum melanjutkan."
            }
          >
            {tab === "profile"
              ? "Profil kamu"
              : tab === "password"
                ? "Keamanan akun"
                : "Privasi & akun"}
          </ProfileSectionHeading>
          {tab === "profile" && (
            <>
              <ProfilePictureInput
                key={user.profile_picture}
                current={user.profile_picture}
                disabled={busy}
              />
              <label>
                Nama lengkap
                <input
                  name="name"
                  defaultValue={user.name}
                  required
                  maxLength={150}
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  defaultValue={user.email}
                  required
                />
              </label>
            </>
          )}
          {tab === "password" && (
            <>
              <label>
                Password lama
                <PasswordInput
                  name="old_password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <label>
                Password baru
                <PasswordInput
                  name="new_password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Konfirmasi password baru
                <PasswordInput
                  name="new_password_confirm"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
            </>
          )}
          {tab === "delete" && (
            <>
              <p className="error p-3 text-[12px] leading-[1.7] rounded-[7px] bg-error-tint text-error">
                Akun dan riwayat pesanan akan dihapus permanen. Pesanan aktif
                dibatalkan dan stok dikembalikan.
              </p>
              <label>
                Konfirmasi password
                <PasswordInput
                  name="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <label className="check-label flex flex-row items-start gap-3 text-xs leading-relaxed [&_input]:mt-1 [&_input]:size-4 [&_input]:shrink-0 [&_input]:accent-brand">
                <input type="checkbox" required />
                Saya ingin menghapus akun secara permanen.
              </label>
            </>
          )}
          {error && (
            <p
              className="error p-3 text-[12px] leading-[1.7] rounded-[7px] bg-error-tint text-error"
              role="alert"
            >
              {error}
            </p>
          )}
          {message && (
            <p
              className="success p-3 text-[12px] leading-[1.7] rounded-[7px] bg-surface-2 text-success"
              role="status"
            >
              {message}
            </p>
          )}
          <button
            className={
              tab === "delete"
                ? "mt-2 min-h-11 rounded-lg bg-error px-5 py-3 text-sm font-bold text-on-error"
                : `${profilePrimary} mt-2 w-full`
            }
            disabled={busy}
          >
            {busy
              ? "Menyimpan…"
              : tab === "delete"
                ? "Hapus akun permanen"
                : "Simpan perubahan"}
          </button>
          {tab !== "delete" && (
            <p className="text-xs leading-relaxed text-muted">
              Perubahan disimpan ke akunmu dan bisa diubah kembali kapan saja.
            </p>
          )}
        </form>
        )}
      </div>
    </Modal>
  );
}
