"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, type User } from "@/lib/api";
import RoleWorkspace from "./role-workspace";
import { PasswordInput } from "./account";
import Modal from "./modal";
import s from "./role-workspace.module.css";
export default function WorkspaceAccount({
  role = "partner",
}: {
  role?: "partner" | "admin";
}) {
  return (
    <RoleWorkspace
      role={role}
      title="Akun"
      subtitle="Kelola data login dan keamanan akun."
    >
      {(user, onUser) => <Account user={user} onUser={onUser} />}
    </RoleWorkspace>
  );
}
function Account({
  user,
  onUser,
}: {
  user: User;
  onUser: (user: User | null) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("password"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [next, setNext] = useState(""),
    [repeat, setRepeat] = useState(""),
    [old, setOld] = useState(""),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState(false),
    [password, setPassword] = useState("");
  const valid =
    next.length >= 8 &&
    /[A-Za-z]/.test(next) &&
    /\d/.test(next) &&
    next === repeat &&
    !!old;
  const score =
    Number(next.length >= 8) +
    Number(/[A-Za-z]/.test(next) && /\d/.test(next)) +
    Number(next.length >= 12 && /[^A-Za-z0-9]/.test(next));
  function choose(value: string) {
    setTab(value);
    setError("");
    setNotice("");
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (tab === "password") {
        if (!valid) throw new Error("Periksa kata sandi baru dan ulangannya.");
        await api("auth/password", "POST", {
          old_password: old,
          new_password: next,
          new_password_confirm: repeat,
        });
        setOld("");
        setNext("");
        setRepeat("");
        setNotice(
          "Kata sandi berhasil diganti. Perangkat lain perlu masuk ulang.",
        );
      } else {
        const data = Object.fromEntries(new FormData(e.currentTarget));
        onUser(await api<User>("auth/me", "PATCH", data));
        setNotice("Data login berhasil disimpan.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmation || !password || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("auth/me", "DELETE", { password });
      onUser(null);
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Pengaturan akun mitra">
      <p className={`${s.muted} mb-6`}>
        Masuk sebagai <strong>{user.username}</strong> ·{" "}
        {user.role === "admin" ? "Admin" : "Mitra"}
      </p>
      <div
        className={`${s.filters} mb-8`}
        role="group"
        aria-label="Pengaturan akun"
      >
        {[
          ["profile", "Data login"],
          ["password", "Kata sandi"],
          ["sessions", "Sesi aktif"],
          ["delete", "Hapus akun"],
        ].map(([key, label]) => (
          <button
            role="button"
            aria-pressed={tab === key}
            className={s.pill}
            key={key}
            onClick={() => choose(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <p role="status" className={s.message}>
          {notice}
        </p>
      )}
      {tab === "sessions" ? (
        <section className={`${s.card} max-w-2xl`}>
          <h2 className={s.title}>Sesi aktif</h2>
          <p className={`${s.muted} mt-4`}>
            Kamu sedang masuk pada perangkat ini. Setelah kata sandi diubah,
            perangkat lain diminta masuk ulang. Daftar perangkat belum tersedia.
          </p>
        </section>
      ) : tab === "delete" ? (
        <section className={`${s.card} max-w-2xl`}>
          <h2 className={s.title}>Hapus akun</h2>
          <p className={`${s.muted} my-4`}>
            Tindakan permanen. Mitra harus menangani seluruh pesanan aktif
            terlebih dahulu. Listing akan dinonaktifkan; riwayat pembeli
            dipertahankan.
          </p>
          <button
            className={s.danger}
            onClick={() => {
              setDeleting(true);
              setPassword("");
              setConfirmation(false);
              setError("");
            }}
          >
            Hapus akun
          </button>
        </section>
      ) : (
        <form className={`${s.form} max-w-2xl`} onSubmit={save}>
          <h2 className={s.title}>
            {tab === "password" ? "Ganti kata sandi" : "Data login"}
          </h2>
          {tab === "password" ? (
            <>
              <p className={s.muted}>
                Setelah diganti, semua perangkat lain perlu masuk ulang. Sesi
                perangkat ini tetap tersedia.
              </p>
              <label className={s.label}>
                Kata sandi saat ini
                <PasswordInput
                  className={s.field}
                  value={old}
                  onChange={(e) => setOld(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
              <label className={s.label}>
                Kata sandi baru
                <PasswordInput
                  className={s.field}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                />
                <small>Minimal 8 karakter, campur huruf dan angka.</small>
              </label>
              {next && (
                <div>
                  <meter
                    min={0}
                    max={3}
                    value={score}
                    className="w-full accent-brand"
                    aria-label="Kekuatan kata sandi"
                  />
                  <p className={s.muted}>
                    {["Terlalu pendek", "Lemah", "Sedang", "Kuat"][score]}
                  </p>
                </div>
              )}
              <label className={s.label}>
                Ulangi kata sandi baru
                <PasswordInput
                  className={s.field}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                {repeat && repeat !== next && (
                  <small className="text-error" role="status">
                    Harus sama dengan kata sandi baru.
                  </small>
                )}
              </label>
            </>
          ) : (
            <>
              <label className={s.label}>
                Username
                <input className={s.field} value={user.username} disabled />
              </label>
              <label className={s.label}>
                Nama lengkap
                <input
                  className={s.field}
                  name="name"
                  defaultValue={user.name}
                  maxLength={150}
                  required
                />
              </label>
              <label className={s.label}>
                Email
                <input
                  className={s.field}
                  name="email"
                  defaultValue={user.email}
                  type="email"
                  required
                />
              </label>
            </>
          )}
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <div>
            <button
              className={s.primary}
              disabled={busy || (tab === "password" && !valid)}
            >
              {busy
                ? "Menyimpan…"
                : tab === "password"
                  ? "Simpan kata sandi"
                  : "Simpan perubahan"}
            </button>
          </div>
        </form>
      )}
      {deleting && (
        <Modal
          title="Hapus akun permanen?"
          onClose={() => {
            if (!busy) setDeleting(false);
          }}
        >
          <form onSubmit={remove} className={s.form}>
            <p>
              Listing dinonaktifkan dan akun dihapus. Pesanan aktif harus
              diselesaikan/dibatalkan dahulu. Riwayat transaksi pembeli tetap
              tersimpan.
            </p>
            <label className={s.label}>
              Konfirmasi kata sandi
              <PasswordInput
                className={s.field}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <label className={s.row}>
              <input
                type="checkbox"
                checked={confirmation}
                onChange={(e) => setConfirmation(e.target.checked)}
                required
              />
              Saya ingin menghapus akun secara permanen.
            </label>
            {error && (
              <p role="alert" className={s.error}>
                {error}
              </p>
            )}
            <div className={s.actions}>
              <button
                type="button"
                className={s.secondary}
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Batal
              </button>
              <button
                className={s.danger}
                disabled={busy || !confirmation || !password}
              >
                {busy ? "Menghapus…" : "Hapus akun permanen"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
