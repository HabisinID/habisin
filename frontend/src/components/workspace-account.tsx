"use client";
import ProfilePictureInput, {
  pictureFormData,
  pictureRequestBody,
} from "./profile-picture";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, type User } from "@/lib/api";
import RoleWorkspace from "./role-workspace";
import { PasswordInput } from "./account";
import Modal from "./modal";
import s from "./role-workspace.module.css";
import {
  ProfileIdentity,
  ProfileSectionHeading,
  profileField,
  profileLabel,
  profilePrimary,
  profileTabs,
} from "./profile-ui";
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
  const [tab, setTab] = useState("profile"),
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
        const data = pictureRequestBody(pictureFormData(e.currentTarget));
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
    <section
      aria-label="Pengaturan akun mitra"
      className="mx-auto grid max-w-5xl grid-cols-[240px_minmax(0,1fr)] items-start gap-10 compact:grid-cols-1 compact:gap-6"
    >
      <aside className="space-y-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          Ruang pribadi kamu
        </p>
        <ProfileIdentity user={user} />
        <p className="px-1 text-xs leading-relaxed text-muted">
          Satu akun untuk semua aktivitasmu di Habisin. Kelola profil dan
          keamanan dari sini.
        </p>
      </aside>
      <div className="min-w-0">
        <div
          className={`${profileTabs} mb-7`}
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
              perangkat lain diminta masuk ulang. Daftar perangkat belum
              tersedia.
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
          <form className="flex min-w-0 flex-col gap-5" onSubmit={save}>
            <ProfileSectionHeading
              letter={tab === "password" ? "B" : "A"}
              description={
                tab === "password"
                  ? "Kata sandi yang kuat membantu menjaga akunmu."
                  : "Nama dan email untuk aktivitasmu sehari-hari."
              }
            >
              {tab === "password" ? "Ganti kata sandi" : "Data login"}
            </ProfileSectionHeading>
            {tab === "password" ? (
              <>
                <p className={s.muted}>
                  Setelah diganti, semua perangkat lain perlu masuk ulang. Sesi
                  perangkat ini tetap tersedia.
                </p>
                <label className={profileLabel}>
                  Kata sandi saat ini
                  <PasswordInput
                    className={profileField}
                    value={old}
                    onChange={(e) => setOld(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </label>
                <label className={profileLabel}>
                  Kata sandi baru
                  <PasswordInput
                    className={profileField}
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
                <label className={profileLabel}>
                  Ulangi kata sandi baru
                  <PasswordInput
                    className={profileField}
                    name="new_password_confirm"
                    value={repeat}
                    aria-invalid={!!repeat && repeat !== next}
                    aria-describedby={
                      repeat && repeat !== next
                        ? "workspace-password-mismatch"
                        : undefined
                    }
                    maxLength={128}
                    onChange={(e) => setRepeat(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  {repeat && repeat !== next && (
                    <small
                      id="workspace-password-mismatch"
                      className="text-error"
                      role="status"
                    >
                      Harus sama dengan kata sandi baru.
                    </small>
                  )}
                </label>
              </>
            ) : (
              <>
                <label className={profileLabel}>
                  Username
                  <input
                    className={profileField}
                    value={user.username}
                    disabled
                  />
                </label>
                <ProfilePictureInput
                  key={user.profile_picture}
                  current={user.profile_picture}
                  disabled={busy}
                />
                <label className={profileLabel}>
                  Nama lengkap
                  <input
                    className={profileField}
                    name="name"
                    defaultValue={user.name}
                    maxLength={150}
                    required
                  />
                </label>
                <label className={profileLabel}>
                  Email
                  <input
                    className={profileField}
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
                className={profilePrimary}
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
      </div>
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
            <label className={profileLabel}>
              Konfirmasi kata sandi
              <PasswordInput
                className={profileField}
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
