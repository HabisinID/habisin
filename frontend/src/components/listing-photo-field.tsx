"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw, ImageOff } from "lucide-react";
import type { Listing, UploadProgress } from "@/lib/api";
import { validatePhoto } from "@/lib/listing-photo";
import { useObjectUrl } from "@/hooks/use-object-url";
import ListingImage from "./listing-image";
import styles from "./listing-composer.module.css";
const CropEditor = dynamic(() => import("./listing-crop-editor"), {
  ssr: false,
  loading: () => <p role="status">Memuat editor crop…</p>,
});
export type PhotoDraft = {
  mode: "url" | "upload";
  url: string;
  file: File | null;
  editing: boolean;
};
export default function ListingPhotoField({
  value,
  onChange,
  item,
  error,
  progress,
  busy = false,
  onRetry,
}: {
  value: PhotoDraft;
  onChange: (value: PhotoDraft) => void;
  item: Listing | null;
  error?: string;
  progress?: UploadProgress | null;
  busy?: boolean;
  onRetry?: () => void;
}) {
  const [source, setSource] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const filePreview = useObjectUrl(value.file);
  const urls = useRef(new Set<string>());
  const sequence = useRef({ value: 0 });
  const input = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const recrop = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<HTMLElement | null>(null);
  function revoke(url: string) {
    if (url) {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    }
  }
  function objectURL(file: File) {
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    return url;
  }
  useEffect(() => {
    const active = urls.current;
    const epoch = sequence.current;
    return () => {
      epoch.value++;
      active.forEach((url) => URL.revokeObjectURL(url));
      active.clear();
    };
  }, []);

  function finish() {
    setOpen(false);
    onChange({ ...value, editing: false });
    requestAnimationFrame(() => focusAfter.current?.focus());
  }
  const shown =
    value.mode === "url"
      ? value.url
      : value.file
        ? filePreview
        : item?.image_source === "upload"
          ? item.image
          : "";
  function choose() {
    if (value.mode === "url") urlInput.current?.focus();
    else input.current?.click();
  }
  return (
    <fieldset className={styles.photoField} disabled={busy}>
      <legend>
        Foto makanan<span className={styles.desktopOnly}> *</span>
      </legend>
      <div className={styles.photoBox} data-empty={!shown}>
        {shown ? (
          <ListingImage src={shown} alt="Preview foto listing 4:3" />
        ) : (
          <button
            ref={changeButton}
            className={styles.photoEmpty}
            type="button"
            onClick={choose}
          >
            <ImagePlus size={32} />
            <span>Tambahkan foto makanan</span>
          </button>
        )}
        {shown && !open && (
          <button
            className={styles.photoChange}
            ref={changeButton}
            type="button"
            onClick={choose}
          >
            <Camera size={16} />
            Ganti foto
          </button>
        )}
        {(loading || progress || busy) && (
          <div className={styles.uploadStatus} role="status">
            <div>
              {loading
                ? "Memeriksa foto…"
                : progress && progress.loaded < progress.total
                  ? `Mengunggah ${Math.round((progress.loaded / progress.total) * 100)}% · ${(progress.loaded / 1048576).toFixed(1)} MB dari ${(progress.total / 1048576).toFixed(1)} MB`
                  : "Memproses listing…"}
              {progress && (
                <progress
                  max={progress.total}
                  value={progress.loaded}
                  aria-label="Progres unggah foto"
                />
              )}
            </div>
          </div>
        )}
      </div>
      {(localError || error) && (
        <div
          className={styles.photoError}
          role="alert"
          id="listing-image-error"
        >
          <ImageOff size={18} />
          <div>
            <strong>Foto belum dapat digunakan</strong>
            <p>{localError || error}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              error && onRetry ? onRetry() : input.current?.click()
            }
          >
            <RefreshCw size={14} />
            Coba lagi
          </button>
        </div>
      )}
      <p className={styles.photoHelp}>
        Foto dari etalase juga boleh. Atur crop 4:3.
      </p>
      <div className={styles.photoModes}>
        {(
          [
            ["upload", "Upload foto"],
            ["url", "Gunakan URL"],
          ] as const
        ).map(([mode, label]) => (
          <label key={mode}>
            <input
              type="radio"
              name="photo_mode"
              checked={value.mode === mode}
              disabled={open || loading}
              onChange={() => {
                setLocalError("");
                onChange({ ...value, mode });
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <input
        ref={input}
        id="listing-photo-file"
        aria-label="Pilih file foto"
        type="file"
        className="sr-only"
        accept="image/jpeg,image/png,image/webp"
        disabled={loading || open}
        aria-invalid={!!(localError || error)}
        aria-describedby={
          localError || error
            ? "listing-image-error listing-photo-hint"
            : "listing-photo-hint"
        }
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const ticket = ++sequence.current.value;
          const url = objectURL(file);
          setLoading(true);
          setLocalError("");
          onChange({ ...value, editing: true });
          try {
            await validatePhoto(file, url);
            if (ticket !== sequence.current.value) {
              revoke(url);
              return;
            }
            revoke(source);
            setSource(url);
            setOpen(true);
            focusAfter.current = changeButton.current || input.current;
          } catch (e) {
            revoke(url);
            if (ticket === sequence.current.value) {
              setLocalError((e as Error).message || "Foto tidak dapat dibaca.");
              onChange({ ...value, editing: false });
            }
          } finally {
            if (ticket === sequence.current.value) setLoading(false);
          }
        }}
      />
      {value.mode === "url" && (
        <div className={styles.field}>
          <label htmlFor="listing-image">URL foto makanan</label>
          <input
            ref={urlInput}
            id="listing-image"
            type="url"
            value={value.url}
            maxLength={250}
            placeholder="https://contoh.com/foto-makanan.jpg"
            onChange={(e) => onChange({ ...value, url: e.target.value })}
            aria-invalid={!!error}
          />
        </div>
      )}
      {open && (
        <div className={styles.crop}>
          <CropEditor
            key={source}
            src={source}
            onCancel={finish}
            onConfirm={(file) => {
              setOpen(false);
              onChange({ ...value, file, editing: false });
              requestAnimationFrame(() =>
                (recrop.current || changeButton.current)?.focus(),
              );
            }}
          />
        </div>
      )}
      {source && !open && (
        <button
          type="button"
          ref={recrop}
          className={styles.textButton}
          onClick={() => {
            focusAfter.current = recrop.current;
            setOpen(true);
            onChange({ ...value, editing: true });
          }}
        >
          Crop ulang
        </button>
      )}
      <details className={styles.photoFormat}>
        <summary>Format dan ukuran foto</summary>{" "}
        <p id="listing-photo-hint" className={styles.photoHelp}>
          JPEG, PNG, WebP statis · maks. 10 MiB/20 MP. Hasil crop 400 × 300
          sampai 1600 × 1200. Pilih satu sumber; URL publik tetap didukung.
        </p>
      </details>
    </fieldset>
  );
}
