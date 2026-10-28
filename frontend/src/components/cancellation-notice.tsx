import type { Reservation } from "@/lib/api";
export default function CancellationNotice({ order }: { order: Reservation }) {
  if (!order.cancellation_note) return null;
  return (
    <div
      role="status"
      className="mt-4 rounded-field border border-error/40 bg-error-tint p-4 text-sm leading-relaxed text-error"
    >
      <p className="font-bold">
        Dibatalkan oleh {order.cancelled_by === "partner" ? "mitra" : "pembeli"}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words">
        {order.cancellation_note}
      </p>
      {order.cancelled_at && (
        <p className="mt-2 text-xs">
          {new Date(order.cancelled_at).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Jakarta",
          })}{" "}
          WIB
        </p>
      )}
    </div>
  );
}
