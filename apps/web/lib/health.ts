"use client";
import { useEffect, useState } from "react";
import { useStreamState } from "@/components/providers";
import { useStatus } from "./live";

/**
 * live: data is current. delayed: data shown may be behind the network. degraded: the data needs a closer look
 * (sync stopped, branch unclear, sources disagree). offline: the API cannot be reached. connecting: no answer yet.
 */
export type HealthLevel = "live" | "delayed" | "degraded" | "offline" | "connecting";

// Node and enforcer tips differ for a moment after every block; only a split that lasts is reported.
const SPLIT_POLLS = 3;

/** One verdict on the data on screen, from the browser's live connection and the API's own sync status. */
export function useHealth() {
  const status = useStatus(), stream = useStreamState(), s = status.data;
  const [splitPolls, setSplitPolls] = useState(0);
  const joint = s?.branch.joint_source_status;
  useEffect(() => { if (joint) setSplitPolls(p => joint === "different_tips" ? p + 1 : 0); }, [joint, status.dataUpdatedAt]);

  const degraded: string[] = [], delayed: string[] = [];
  if (s) {
    if (s.sync_mode === "incompatible") degraded.push("The monitor's data uses a format this site does not support, so synchronization has stopped.");
    if (s.branch.status === "ambiguous") degraded.push("The chain branch is ambiguous, so recent data is not certified.");
    if (splitPolls >= SPLIT_POLLS) degraded.push("The node and the enforcer report different chain tips.");
    // A stale sync is reported by the API as interrupted and unreachable too; one sentence covers all three.
    if (s.sync_stale || s.sync_mode === "interrupted") delayed.push("Synchronization has stopped or fallen behind, so the data shown is not advancing.");
    else if (!s.source_reachable) delayed.push("The monitor's sources are unreachable or have not answered recently.");
    if (s.sync_mode === "bootstrap" || s.sync_mode === "catching_up") delayed.push("The Observatory is catching up with the network.");
  }
  if (stream === "reconnecting") delayed.push("Live updates are reconnecting; panels refresh when you return to the page.");

  const level: HealthLevel = status.isError ? "offline" : !s ? "connecting" : degraded.length ? "degraded" : delayed.length ? "delayed" : "live";
  const reasons = level === "offline" ? ["The Observatory API is unreachable; retrying."] : [...degraded, ...delayed];
  return { level, reasons, status: s, lastUpdate: s?.last_projection_update_at ?? undefined };
}
