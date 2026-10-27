"use client";
import type { AnchorHTMLAttributes } from "react";
import { useApiBase } from "@/components/providers";

/** A link into the API of the network the reader is looking at. */
export function ApiLink({ path, ...props }: { path: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={useApiBase() + path}/>;
}
