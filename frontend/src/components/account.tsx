"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Leaf, ShieldCheck } from "lucide-react";
import Modal from "./modal";
import { api, type User } from "@/lib/api";

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
      onUser(await api<User>(`auth/${mode}`, "POST", values));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        mode === "login" ? "Senang kamu kembali." : "Mulai langkah baikmu."
      }
      onClose={onClose}
    >
      <div className="auth-intro flex gap-[12px] items-center mb-[23px] [&_p]:text-[12px] [&_p]:leading-[1.8] [&_p]:text-[#778370]">
        <span className="round-leaf w-[44px] h-[44px] rounded-[13px] bg-[#e8efdf] text-brand grid place-items-center shrink-0">
          <Leaf />
        </span>
        <p>
          {mode === "login"
            ? "Masuk dan temukan makanan enak yang menunggumu."
            : "Makan enak, lebih hemat, dan bantu bumi bersama HABISIN."}
        </p>
      </div>
      <form
        onSubmit={submit}
        className="form flex flex-col gap-[15px] [&_>_label]:flex [&_>_label]:flex-col [&_>_label]:gap-[7px] [&_>_label]:font-semibold [&_>_label]:text-[11px] [&_>_label]:text-[#5d7054] [&_input]:w-full [&_input]:[border:1px_solid_#dfe5d7] [&_input]:rounded-[7px] [&_input]:pt-[12px] [&_input]:pr-[12px] [&_input]:pb-[12px] [&_input]:pl-[12px] [&_input]:bg-[white] [&_input]:text-[var(--dark)] [&_input]:text-[13px] [&_input]:font-normal [&_select]:w-full [&_select]:[border:1px_solid_#dfe5d7] [&_select]:rounded-[7px] [&_select]:pt-[12px] [&_select]:pr-[12px] [&_select]:pb-[12px] [&_select]:pl-[12px] [&_select]:bg-[white] [&_select]:text-[var(--dark)] [&_select]:text-[13px] [&_select]:font-normal [&_small]:text-[10px] [&_small]:min-h-[12px] [&_small]:font-normal [&_.check-label]:flex-row [&_.check-label]:items-center [&_.check-label]:leading-[1.7]"
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
          <input
            name="password"
            type="password"
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
            Daftar sebagai
            <select name="role" defaultValue={initialRole}>
              <option value="buyer">Pembeli — selamatkan makanan</option>
              <option value="partner">Mitra — pemilik usaha makanan</option>
            </select>
          </label>
        )}
        {error && (
          <p
            className="error pt-[12px] pr-[12px] pb-[12px] pl-[12px] text-[12px] leading-[1.7] rounded-[7px] bg-[#fbeae4] text-[#a34337]"
            role="alert"
          >
            {error}
          </p>
        )}
        <button
          className="button primary full inline-flex items-center justify-center gap-[12px] rounded-[8px] pt-[13px] pr-[20px] pb-[13px] pl-[20px] text-[12px] font-semibold min-h-[44px] [transition:background_0.2s,_transform_0.2s] bg-brand text-[white] [&:hover]:bg-[#174c36] [&:hover]:[transform:translateY(-1px)] w-full mt-[5px]"
          disabled={busy}
        >
          {busy ? "Sebentar…" : mode === "login" ? "Masuk" : "Buat akun"}
          <ArrowRight size={18} />
        </button>
      </form>
      <p className="auth-switch text-center text-[11px] mt-[22px] mr-0 mb-[22px] ml-0 text-[#88907d] [&_button]:font-bold [&_button]:text-brand [&_button]:pl-[5px]">
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
      <p className="secure-note flex items-center justify-center gap-[5px] text-[9px] text-[#929b88] [border-top:1px_solid_var(--line)] pt-[17px] [@media(width<=760px)]:text-[8px]">
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
        onUser(await api<User>("auth/me", "PATCH", data));
        setMessage("Profil berhasil disimpan.");
      }
      if (tab === "password") {
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
  return (
    <Modal title="Akun kamu" onClose={onClose}>
      <div className="profile-identity flex items-center gap-[13px] mt-[10px] mr-0 mb-[25px] ml-0 [&_p]:text-[11px] [&_p]:text-[#8a947e] [&_p]:mt-[5px]">
        <span className="avatar w-[45px] h-[45px] rounded-full bg-[#e3eddb] text-brand grid place-items-center font-bold text-[20px] [&.small]:w-[30px] [&.small]:h-[30px] [&.small]:text-[12px]">
          {(user.name || user.username)[0].toUpperCase()}
        </span>
        <div>
          <strong>{user.name}</strong>
          <p>
            @{user.username} ·{" "}
            {user.role === "buyer"
              ? "Pembeli"
              : user.role === "partner"
                ? "Mitra"
                : "Admin"}
          </p>
        </div>
      </div>
      <div className="tabs flex bg-[#edf1e7] pt-[4px] pr-[4px] pb-[4px] pl-[4px] rounded-[7px] mb-[22px] [&_button]:[flex:1] [&_button]:text-[11px] [&_button]:pt-[10px] [&_button]:pr-[10px] [&_button]:pb-[10px] [&_button]:pl-[10px] [&_button]:rounded-[5px] [&_.active]:bg-[white] [&_.active]:text-brand [&_.active]:shadow-[0_1px_5px_#0001]">
        {[
          ["profile", "Profil"],
          ["password", "Password"],
          ["delete", "Hapus akun"],
        ].map(([key, label]) => (
          <button
            className={tab === key ? "active" : ""}
            key={key}
            onClick={() => {
              setTab(key);
              setError("");
              setMessage("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="form flex flex-col gap-[15px] [&_>_label]:flex [&_>_label]:flex-col [&_>_label]:gap-[7px] [&_>_label]:font-semibold [&_>_label]:text-[11px] [&_>_label]:text-[#5d7054] [&_input]:w-full [&_input]:[border:1px_solid_#dfe5d7] [&_input]:rounded-[7px] [&_input]:pt-[12px] [&_input]:pr-[12px] [&_input]:pb-[12px] [&_input]:pl-[12px] [&_input]:bg-[white] [&_input]:text-[var(--dark)] [&_input]:text-[13px] [&_input]:font-normal [&_select]:w-full [&_select]:[border:1px_solid_#dfe5d7] [&_select]:rounded-[7px] [&_select]:pt-[12px] [&_select]:pr-[12px] [&_select]:pb-[12px] [&_select]:pl-[12px] [&_select]:bg-[white] [&_select]:text-[var(--dark)] [&_select]:text-[13px] [&_select]:font-normal [&_small]:text-[10px] [&_small]:min-h-[12px] [&_small]:font-normal [&_.check-label]:flex-row [&_.check-label]:items-center [&_.check-label]:leading-[1.7]"
        key={tab}
        onSubmit={submit}
      >
        {tab === "profile" && (
          <>
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
              <input
                type="password"
                name="old_password"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              Password baru
              <input
                type="password"
                name="new_password"
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
            <p className="error pt-[12px] pr-[12px] pb-[12px] pl-[12px] text-[12px] leading-[1.7] rounded-[7px] bg-[#fbeae4] text-[#a34337]">
              Akun dan riwayat pesanan akan dihapus permanen. Pesanan aktif
              dibatalkan dan stok dikembalikan.
            </p>
            <label>
              Konfirmasi password
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
              />
            </label>
            <label className="check-label [&_input]:w-auto [&_input]:accent-[var(--green)]">
              <input type="checkbox" required /> Saya ingin menghapus akun
              secara permanen.
            </label>
          </>
        )}
        {error && (
          <p
            className="error pt-[12px] pr-[12px] pb-[12px] pl-[12px] text-[12px] leading-[1.7] rounded-[7px] bg-[#fbeae4] text-[#a34337]"
            role="alert"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            className="success pt-[12px] pr-[12px] pb-[12px] pl-[12px] text-[12px] leading-[1.7] rounded-[7px] bg-[#e8f1e1] text-[#477543]"
            role="status"
          >
            {message}
          </p>
        )}
        <button
          className={`button full inline-flex items-center justify-center gap-[12px] rounded-[8px] pt-[13px] pr-[20px] pb-[13px] pl-[20px] text-[12px] font-semibold min-h-[44px] [transition:background_0.2s,_transform_0.2s] w-full mt-[5px] ${tab === "delete" ? "danger bg-[#a94232] text-[white]" : "primary bg-brand text-[white] [&:hover]:bg-[#174c36] [&:hover]:[transform:translateY(-1px)]"}`}
          disabled={busy}
        >
          {busy
            ? "Menyimpan…"
            : tab === "delete"
              ? "Hapus akun permanen"
              : "Simpan perubahan"}
        </button>
      </form>
    </Modal>
  );
}
