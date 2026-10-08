"use client";
import { useQuery } from "@tanstack/react-query";
import { getMeta } from "./api";

/** The configured native asset symbol; amounts stay exact integers. */
export function useUnit(): string {
  const meta = useQuery({ queryKey: ["meta"], queryFn: getMeta, staleTime: 60_000 });
  return meta.data?.native_asset.symbol ?? "sats";
}
