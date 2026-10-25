"use client";
import Image from "next/image";
import { useState } from "react";

export default function ListingImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div
      className={`relative aspect-[4/3] overflow-hidden bg-[var(--color-surface-2)] ${className}`}
    >
      {src && failedSource !== src ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          className="object-cover"
          onError={() => setFailedSource(src)}
        />
      ) : (
        <span
          role="img"
          aria-label={alt}
          className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-[var(--color-muted)]"
        >
          Foto tidak tersedia
        </span>
      )}
    </div>
  );
}
