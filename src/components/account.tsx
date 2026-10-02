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
      <div className="auth-intro">
        <span className="round-leaf">
          <Leaf />
        </span>
        <p>
          {mode === "login"
            ? "Masuk dan temukan makanan enak yang menunggumu."
            : "Makan enak, lebih hemat, dan bantu bumi bersama HABISIN."}
        </p>
      </div>
      <form onSubmit={submit} className="form">
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
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Sebentar…" : mode === "login" ? "Masuk" : "Buat akun"}
          <ArrowRight size={18} />
        </button>
      </form>
      <p className="auth-switch">
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
      <p className="secure-note">
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
      <div className="profile-identity">
        <span className="avatar">
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
      <div className="tabs">
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
      <form className="form" key={tab} onSubmit={submit}>
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
            <p className="error">
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
            <label className="check-label">
              <input type="checkbox" required /> Saya ingin menghapus akun
              secara permanen.
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        <button
          className={`button full ${tab === "delete" ? "danger" : "primary"}`}
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
