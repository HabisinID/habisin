import type { Store, StoreDay } from "./api";
export const weekdays = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];
export function storeSchedule(store: Store | null): StoreDay[] {
  return store?.weekly_hours?.length === 7
    ? structuredClone(store.weekly_hours)
    : weekdays.map((_, day) => ({
        day,
        enabled: true,
        sessions: [
          {
            start: store?.opening_time.slice(0, 5) || "08:00",
            end: store?.closing_time.slice(0, 5) || "21:00",
          },
        ],
      }));
}
export function todayStoreHours(store: Store, now = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Jakarta",
  }).format(now);
  const index = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ].indexOf(weekday);
  const schedule = store.weekly_hours?.find((d) => d.day === index);
  return schedule
    ? { enabled: schedule.enabled, sessions: schedule.sessions }
    : {
        enabled: true,
        sessions: [
          {
            start: store.opening_time.slice(0, 5),
            end: store.closing_time.slice(0, 5),
          },
        ],
      };
}
export function storeHoursLabel(store: Store) {
  const hours = todayStoreHours(store);
  return !hours.enabled
    ? "Tutup hari ini"
    : hours.sessions
        .map((s) => `${s.start.replace(":", ".")}–${s.end.replace(":", ".")}`)
        .join(", ") + " WIB";
}
export function pickupEndForStore(store: Store, now = new Date()) {
  const hours = todayStoreHours(store, now);
  if (!hours.enabled || !hours.sessions.length) return "";
  const local = now
    .toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" })
    .replace(" ", "T");
  const last = hours.sessions[hours.sessions.length - 1];
  if (last.end < last.start) {
    const next = new Date(local.slice(0, 10) + "T12:00:00+07:00");
    next.setUTCDate(next.getUTCDate() + 1);
    return (
      next.toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }) +
      "T" +
      last.end
    );
  }
  return local.slice(0, 10) + "T" + last.end;
}
