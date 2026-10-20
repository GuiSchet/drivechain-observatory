/** One Observatory backend: each network has its own API. */
export type Network = { id: string; label: string; apiBaseUrl: string };

/** Remembers the reader's network across pages; `?network=` overrides and updates it. */
export const NETWORK_COOKIE = "observatory-network";

function configured(): Network[] {
  const raw = process.env.NEXT_PUBLIC_NETWORKS;
  if (raw) {
    const list = JSON.parse(raw) as Network[];
    if (!Array.isArray(list) || !list.length || list.some(n => !n?.id || !n.label || !n.apiBaseUrl)) {
      throw new Error("NEXT_PUBLIC_NETWORKS must be a non-empty JSON list of {id, label, apiBaseUrl}");
    }
    return list;
  }
  // A single-network deployment configured the way it was before the selector.
  return [{
    id: process.env.NEXT_PUBLIC_DEFAULT_NETWORK ?? "default",
    label: process.env.NEXT_PUBLIC_NETWORK_LABEL ?? "Default",
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8080",
  }];
}

export const networks: Network[] = configured();
export const defaultNetwork: Network = networks.find(n => n.id === process.env.NEXT_PUBLIC_DEFAULT_NETWORK) ?? networks[0];

/** The configured network with this id, or the default one. */
export function resolveNetwork(id: string | null | undefined): Network {
  return networks.find(n => n.id === id) ?? defaultNetwork;
}

/** The network a browser page load uses: `?network=`, then the cookie, then the default. Fixed for the page's life. */
function readBrowserNetwork(): Network {
  const param = new URLSearchParams(window.location.search).get("network");
  if (networks.some(n => n.id === param)) return resolveNetwork(param);
  const cookie = document.cookie.split("; ").find(c => c.startsWith(NETWORK_COOKIE + "="))?.slice(NETWORK_COOKIE.length + 1);
  return resolveNetwork(cookie ? decodeURIComponent(cookie) : null);
}

export const browserNetwork: Network | null = typeof window === "undefined" ? null : readBrowserNetwork();

export function rememberNetwork(id: string) {
  document.cookie = `${NETWORK_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
}

/** A readable name for the network the API reports, e.g. "eCash Betanet". */
export function networkLabel(id: string | null | undefined): string {
  const known = networks.find(n => n.id === id);
  if (known) return known.label;
  if (process.env.NEXT_PUBLIC_NETWORK_LABEL) return process.env.NEXT_PUBLIC_NETWORK_LABEL;
  if (id === "betanet") return "eCash Betanet";
  if (id === "mainnet") return "eCash";
  return id ?? "Unknown network";
}
