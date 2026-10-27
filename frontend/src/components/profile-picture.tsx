"use client";

import { useEffect, useState } from "react";

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
    <div className="space-y-3">
      <span className="grid h-20 w-20 place-items-center rounded-full bg-light text-brand">
        <Avatar src={source} name="Profil" />
      </span>
      <label className="block space-y-2 text-sm font-semibold">
        Foto profil
        <input
          type="file"
          name="profile_picture"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          className="block w-full text-sm"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setPreview(selected ? URL.createObjectURL(selected) : null);
            setRemoved(false);
            onDirtyChange?.(!!selected);
          }}
        />
      </label>
      <p className="text-xs text-muted">
        JPEG, PNG, atau WebP statis. Maksimal 5 MiB dan 20 megapiksel.
      </p>
      {source && (
        <button
          type="button"
          disabled={disabled}
          className="text-sm font-semibold text-error"
          onClick={(event) => {
            const input = event.currentTarget
              .closest("form")
              ?.querySelector<HTMLInputElement>(
                'input[name="profile_picture"]',
              );
            if (input) input.value = "";
            setFile(null);
            setPreview(null);
            setRemoved(true);
            onDirtyChange?.(!!current);
          }}
        >
          Hapus foto
        </button>
      )}
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
