import type { Listing } from "./api";
export const URGENT_WINDOW = 30 * 60 * 1000;
export function listingTime(
  item: Pick<Listing, "pickup_start" | "pickup_end">,
  now: number,
) {
  const end = Date.parse(item.pickup_end);
  const remaining = Math.max(0, Number.isFinite(end) ? end - now : 0);
  const minutes = Math.ceil(remaining / 60000);
  const hours = Math.floor(minutes / 60);
  const label =
    remaining === 0
      ? "Waktu ambil berakhir"
      : hours >= 24
        ? `${Math.floor(hours / 24)} hari ${hours % 24} jam lagi`
        : hours
          ? `${hours} jam${minutes % 60 ? ` ${minutes % 60} mnt` : ""} lagi`
          : `${minutes} menit lagi`;
  const duration = end - Date.parse(item.pickup_start);
  return {
    remaining,
    urgent: remaining > 0 && remaining < URGENT_WINDOW,
    label,
    progress:
      remaining > 0
        ? duration > 0
          ? Math.min(1, remaining / duration)
          : 1
        : 0,
  };
}
export function preparedLabel(value?: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? `${new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`
    : "Belum dicantumkan";
}
