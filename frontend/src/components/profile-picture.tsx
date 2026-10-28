"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";

export function Avatar({
  src,
  name,
  fallback = name.slice(0, 2).toUpperCase(),
}: {
  src?: string | null;
  name: string;
  fallback?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return src && failedSource !== src ? (
    // Uploaded media is served through the same-origin media proxy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Foto ${name}`}
      onError={() => setFailedSource(src)}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    <>{fallback}</>
  );
}

export default function ProfilePictureInput({
  current,
  disabled,
  onDirtyChange,
}: {
  current?: string | null;
  disabled?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  const source = file ? preview : removed ? null : current;
  return (
    <div className="flex items-start gap-4 rounded-xl border border-dashed border-border/60 bg-cream p-4 mobile:gap-3">
      <span className="relative grid size-20 shrink-0 place-items-center rounded-full bg-light text-xl font-bold text-brand">
        <span className="grid size-full place-items-center overflow-hidden rounded-full">
          <Avatar src={source} name="Profil" />
        </span>
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-cream bg-brand text-on-brand"
        >
          <Camera size={13} />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Foto profil</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Biar lebih mudah dikenali.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-semibold hover:bg-light"
          >
            <Upload size={14} />
            {source ? "Ganti foto" : "Pilih foto"}
          </button>
          <input
            ref={inputRef}
            type="file"
            aria-label="Foto profil"
            name="profile_picture"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            className="sr-only"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setPreview(selected ? URL.createObjectURL(selected) : null);
              setRemoved(false);
              onDirtyChange?.(!!selected);
            }}
          />
          {source && (
            <button
              type="button"
              disabled={disabled}
              className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-error"
              onClick={() => {
                if (inputRef.current) inputRef.current.value = "";
                setFile(null);
                setPreview(null);
                setRemoved(true);
                onDirtyChange?.(!!current);
              }}
            >
              <X size={13} />
              Hapus foto
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          JPEG, PNG, atau WebP · Maks. 5 MiB · 20 megapiksel
        </p>
      </div>
      {removed && <input type="hidden" name="profile_picture" value="" />}
    </div>
  );
}

export function pictureFormData(form: HTMLFormElement) {
  const data = new FormData(form);
  const picture = data.getAll("profile_picture");
  data.delete("profile_picture");
  for (const value of picture) {
    if (typeof value === "string" || value.size > 0)
      data.set("profile_picture", value);
  }
  return data;
}

export function pictureRequestBody(
  data: FormData,
  values: Record<string, unknown> = {},
) {
  const multipart = Array.from(data.values()).some(
    (value) => value instanceof File && value.size > 0,
  );
  if (multipart) {
    for (const [key, value] of Object.entries(values))
      data.set(
        key,
        typeof value === "object" ? JSON.stringify(value) : String(value),
      );
    return data;
  }
  return { ...Object.fromEntries(data), ...values };
}
