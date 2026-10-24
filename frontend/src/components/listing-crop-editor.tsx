"use client";
import Cropper, { type Area } from "react-easy-crop";
import { useEffect, useRef, useState } from "react";
import { cropPhoto } from "@/lib/listing-photo";
import { primaryButton, secondaryButton } from "./store-ui";

export default function ListingCropEditor({
  src,
  onConfirm,
  onCancel,
}: {
  src: string;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}) {
  const section = useRef<HTMLElement>(null);
  const lifetime = useRef({ active: true });
  useEffect(() => {
    const current = lifetime.current;
    current.active = true;
    section.current?.focus();
    return () => {
      current.active = false;
    };
  }, []);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const area = useRef<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section
      ref={section}
      tabIndex={-1}
      aria-busy={busy}
      aria-label="Editor crop foto"
      className="space-y-4 rounded-xl border border-[#7a8872] bg-[#fbf7ec] p-3"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!busy) onCancel();
        }
      }}
    >
      <h4 className="font-bold">Atur foto · 4:3</h4>
      <p className="text-sm text-[#5a6653]">
        Geser foto atau gunakan tombol panah pada area crop. Cubit atau atur
        zoom untuk memperbesar.
      </p>
      <div
        className={`relative h-64 overflow-hidden rounded-md bg-[#1c2616] ${busy ? "pointer-events-none" : ""}`}
        aria-label="Area crop, gunakan tombol panah"
      >
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={4 / 3}
          minZoom={1}
          maxZoom={3}
          restrictPosition
          keyboardStep={10}
          cropperProps={{ "aria-label": "Geser crop dengan tombol panah" }}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropAreaChange={(_, pixels) => {
            area.current = pixels;
          }}
        />
      </div>
      <label className="block text-sm font-semibold">
        Zoom foto ({zoom.toFixed(1)}×)
        <input
          className="mt-2 w-full"
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={zoom}
          disabled={busy}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          onClick={() => {
            setRotation((r) => (r + 90) % 360);
            setCrop({ x: 0, y: 0 });
            setZoom(1);
          }}
        >
          Putar 90°
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          onClick={() => {
            setRotation(0);
            setCrop({ x: 0, y: 0 });
            setZoom(1);
            setError("");
          }}
        >
          Reset crop
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          onClick={onCancel}
        >
          Batal crop
        </button>
        <button
          type="button"
          className={primaryButton}
          disabled={busy}
          onClick={async () => {
            if (!area.current) return;
            setBusy(true);
            setError("");
            try {
              const file = await cropPhoto(src, area.current, rotation);
              if (lifetime.current.active) onConfirm(file);
            } catch (e) {
              if (!lifetime.current.active) return;
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? "Menyiapkan foto…" : "Gunakan foto"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[#b3261e]">
          {error}
        </p>
      )}
    </section>
  );
}
