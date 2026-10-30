"use client";

import { useCallback, useEffect, useState } from "react";
import { api, rupiah } from "@/lib/api";
import styles from "./partner-performance.module.css";

export type PartnerSalesStats = {
  sold_portions: number;
  simulated_total: number;
  free_portions: number;
  picked_up_series: { day: string; portions: number }[];
};

export function PartnerPerformancePanel() {
  const [period, setPeriod] = useState("week");
  const [sales, setSales] = useState<PartnerSalesStats | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(
    (signal?: AbortSignal) =>
      api<{ sales: PartnerSalesStats }>(
        `partner/dashboard?period=${period}`,
        "GET",
        undefined,
        signal,
      )
        .then((result) => {
          if (!signal?.aborted) {
            setSales(result.sales);
            setError("");
          }
        })
        .catch((reason: Error) => {
          if (!signal?.aborted) setError(reason.message);
        }),
    [period],
  );

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => void load(controller.signal);
    refresh();
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [load]);

  return (
    <>
      <PartnerPerformance
        period={period}
        sales={sales}
        onPeriodChange={setPeriod}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error} <button onClick={() => void load()}>Coba lagi</button>
        </p>
      )}
    </>
  );
}

const PERIODS = [
  { key: "today", label: "Hari ini" },
  { key: "week", label: "7 hari" },
  { key: "month", label: "30 hari" },
  { key: "year", label: "Tahun" },
];

export function PartnerPerformance({
  period,
  sales,
  onPeriodChange,
}: {
  period: string;
  sales: PartnerSalesStats | null;
  onPeriodChange: (period: string) => void;
}) {
  const max = Math.max(
    1,
    ...(sales?.picked_up_series.map((day) => day.portions) ?? []),
  );
  const periodLabel = PERIODS.find((item) => item.key === period)?.label ?? "Periode";

  return (
    <section className={styles.performance} aria-labelledby="performance-title">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Performa penjualan</p>
          <h2 id="performance-title">Ringkasan {periodLabel.toLowerCase()}</h2>
        </div>
        <div className={styles.periods} aria-label="Periode statistik">
          {PERIODS.map((item) => (
            <button
              aria-pressed={period === item.key}
              key={item.key}
              onClick={() => onPeriodChange(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.metrics} aria-live="polite">
        <article className={styles.metric}>
          <span>Porsi terjual</span>
          <strong>{sales?.sold_portions.toLocaleString("id-ID") ?? "—"}</strong>
          <small>Porsi berbayar yang sudah diambil</small>
        </article>
        <article className={styles.metric}>
          <span>Nilai transaksi</span>
          <strong>{sales ? rupiah(sales.simulated_total) : "—"}</strong>
          <small>Pembayaran simulasi</small>
        </article>
        <article className={styles.metric}>
          <span>Porsi gratis</span>
          <strong>{sales?.free_portions.toLocaleString("id-ID") ?? "—"}</strong>
          <small>Donasi yang sudah diambil</small>
        </article>
      </div>

      <div className={styles.chartHeading}>
        <h3>Porsi terjual · 7 hari terakhir</h3>
        <span>berdasarkan waktu pengambilan</span>
      </div>
      {sales ? (
        <div
          className={styles.chart}
          role="img"
          aria-label="Jumlah porsi berbayar yang sudah diambil per hari selama 7 hari terakhir"
        >
          {sales.picked_up_series.map((day) => {
            const weekday = new Date(`${day.day}T12:00:00`).toLocaleDateString(
              "id-ID",
              { weekday: "short" },
            );
            const height =
              day.portions === 0
                ? 2
                : Math.max(8, Math.round((day.portions / max) * 100));
            return (
              <div className={styles.chartDay} key={day.day}>
                <span className={styles.barValue}>{day.portions}</span>
                <div className={styles.barTrack}>
                  <i style={{ height: `${height}%` }} />
                </div>
                <span className={styles.dayLabel}>
                  {weekday} <small>{new Date(`${day.day}T12:00:00`).getDate()}</small>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.loading} role="status">Memuat statistik penjualan…</p>
      )}
      <p className={styles.note}>
        Porsi terjual dan nilai transaksi hanya menghitung pesanan berbayar yang
        sudah diambil. Porsi gratis dihitung terpisah; pembayaran di aplikasi
        masih berupa simulasi.
      </p>
    </section>
  );
}
