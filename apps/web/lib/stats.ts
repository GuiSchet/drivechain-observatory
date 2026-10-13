"use client";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "./api";
import type { NetworkStats, SidechainStats } from "./types";

// Keys start with "protocol" so the live stream refreshes them.
export function useSidechainStats(slot: number | undefined, window: 144 | 1008 = 144) {
  return useQuery({
    queryKey: ["protocol", "stats", slot, window], enabled: slot != null,
    queryFn: () => getJson<SidechainStats>(`/api/v1/sidechains/${slot}/stats?window_blocks=${window}`),
  });
}
export function useNetworkStats(window: 144 | 1008 | 2016 = 144) {
  return useQuery({ queryKey: ["protocol", "network", window], queryFn: () => getJson<NetworkStats>(`/api/v1/network?window_blocks=${window}`) });
}

/** "1 h 25 min", "3 days 4 h", "42 s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "unknown";
  const s = Math.round(Math.abs(seconds)), sign = seconds < 0 ? "−" : "";
  if (s < 60) return `${sign}${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${sign}${m} min`;
  const h = Math.floor(m / 60), rm = m % 60;
  if (h < 48) return `${sign}${h} h${rm ? ` ${rm} min` : ""}`;
  const d = Math.floor(h / 24), rh = h % 24;
  return `${sign}${d} days${rh ? ` ${rh} h` : ""}`;
}

/** Hashes per second with an SI prefix, e.g. "8.95 PH/s". */
export function formatHashrate(hps: number | null | undefined): string {
  if (hps == null || !Number.isFinite(hps)) return "unknown";
  const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s", "ZH/s"];
  let v = hps, i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${units[i]}`;
}

/** Difficulty in full, or with a T/G/M suffix when `short`. */
export function formatDifficulty(d: number | null | undefined, short = false): string {
  if (d == null || !Number.isFinite(d)) return "unknown";
  if (!short) return d > 0 && d < 0.01 ? d.toExponential(3) : d.toLocaleString("en-US", { maximumFractionDigits: 2 });
  for (const [div, suffix] of [[1e12, "T"], [1e9, "G"], [1e6, "M"]] as const) if (d >= div) return `${(d / div).toFixed(2)} ${suffix}`;
  return d > 0 && d < 0.01 ? d.toExponential(3) : d.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** "37.5%" of a part, or "unknown" without a whole. */
export function percent(part: number | null | undefined, whole: number | null | undefined, digits = 1): string {
  return part == null || !whole ? "unknown" : `${((part / whole) * 100).toFixed(digits)}%`;
}

/** An ISO time as "2026-10-13 11:39 UTC". */
export function utc(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "unknown" : t.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
