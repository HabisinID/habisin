import type { Area } from "react-easy-crop";

export async function loadPhoto(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

export async function validatePhoto(file: File, src: string) {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Foto asli maksimal 10 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const word = (i: number, n: number) =>
    String.fromCharCode(...bytes.slice(i, i + n));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = word(1, 3) === "PNG" && bytes[0] === 137;
  const webp = word(0, 4) === "RIFF" && word(8, 4) === "WEBP";
  if (!jpeg && !png && !webp)
    throw new Error(
      "Pilih JPEG, PNG, atau WebP statis. HEIC, GIF, dan SVG tidak didukung.",
    );
  // Read chunk headers, never interpret compressed pixels as chunk names.
  const view = new DataView(bytes.buffer);
  if (png) {
    for (let i = 8; i + 12 <= bytes.length;) {
      if (word(i + 4, 4) === "acTL")
        throw new Error("Foto animasi tidak didukung.");
      const length = view.getUint32(i);
      if (length > bytes.length - i - 12) break;
      i += length + 12;
    }
  }
  if (webp) {
    for (let i = 12; i + 8 <= bytes.length;) {
      const type = word(i, 4);
      if (
        type === "ANIM" ||
        type === "ANMF" ||
        (type === "VP8X" && bytes[i + 8] & 2)
      )
        throw new Error("Foto animasi tidak didukung.");
      const length = view.getUint32(i + 4, true);
      if (length > bytes.length - i - 8) break;
      i += 8 + length + (length % 2);
    }
  }
  const image = await loadPhoto(src);
  if (image.naturalWidth * image.naturalHeight > 20_000_000)
    throw new Error("Foto asli maksimal 20 megapiksel.");
  return image;
}

export async function cropPhoto(src: string, area: Area, rotation: number) {
  const image = await loadPhoto(src);
  const swapped = rotation % 180 !== 0;
  const canvas = document.createElement("canvas");
  canvas.width = swapped ? image.naturalHeight : image.naturalWidth;
  canvas.height = swapped ? image.naturalWidth : image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser tidak mendukung editor foto.");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const unit = Math.floor(Math.min(area.width / 4, area.height / 3, 400));
  if (unit < 100)
    throw new Error(
      "Area crop terlalu kecil. Kurangi zoom atau pilih foto lebih besar (hasil minimal 400 × 300).",
    );
  const output = document.createElement("canvas");
  output.width = unit * 4;
  output.height = unit * 3;
  output
    .getContext("2d")!
    .drawImage(
      canvas,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      output.width,
      output.height,
    );
  const blob = await new Promise<Blob | null>((resolve) =>
    output.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob || blob.size > 5 * 1024 * 1024)
    throw new Error("Hasil crop harus maksimal 5 MiB. Coba foto lain.");
  return new File([blob], "listing.jpg", { type: "image/jpeg" });
}
