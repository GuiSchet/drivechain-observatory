"use client";
import Link from "next/link";
import { useHealth } from "@/lib/health";
import { timeAgo } from "@/lib/explain";
import { useNow } from "@/components/live/basics";

/** Says in words, on every page, when the data shown may be behind or needs a closer look. */
export function StatusBanner() {
  const { level, reasons, lastUpdate } = useHealth(), now = useNow(15_000);
  if (level === "live" || level === "connecting") return null;
  return <div className={`status-banner health-${level}`} role="status">
    <strong>{level === "offline" ? "Live data unavailable." : level === "delayed" ? "The data shown may be behind the network." : "The data shown needs a closer look."}</strong>{" "}
    {reasons.join(" ")}{lastUpdate && level !== "offline" ? ` Last update ${timeAgo(lastUpdate, now)}.` : ""}{" "}
    <Link href="/learn/how-we-know">How we know</Link>
  </div>;
}
