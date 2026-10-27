/** One Observatory backend: each network has its own API. */
export type Network = { id: string; label: string; apiBaseUrl: string };

/** Remembers the reader's network across pages; `?network=` overrides and updates it. */
export const NETWORK_COOKIE = "observatory-network";

/** How the copy names a network and the few facts it quotes about it. */
export type NetworkFacts = {
  /** Short name, as in "Live on Betanet". */
  name: string;
  /** Full name, as in "watches eCash Betanet". */
  fullName: string;
  /** A network that rehearses eCash's mainnet rather than being it. */
  rehearsal: boolean;
};

const facts: Record<string, NetworkFacts> = {
  betanet: { name: "Betanet", fullName: "eCash Betanet", rehearsal: true },
  mainnet: { name: "eCash", fullName: "eCash", rehearsal: false },
};

function configured(): Network[] {
  const raw = process.env.NEXT_PUBLIC_NETWORKS;
  if (raw) {
    const list = JSON.parse(raw) as (Omit<Network, "label"> & { label?: string })[];
    if (!Array.isArray(list) || !list.length || list.some(n => !n?.id || !n.apiBaseUrl)) {
      throw new Error("NEXT_PUBLIC_NETWORKS must be a non-empty JSON list of {id, label?, apiBaseUrl}");
    }
    // The copy states facts about each network; an id it does not know would be described as another network.
    const unknown = list.filter(n => !facts[n.id]).map(n => n.id);
    if (unknown.length) {
      throw new Error(`NEXT_PUBLIC_NETWORKS has unknown ids (${unknown.join(", ")}); known: ${Object.keys(facts).join(", ")}`);
    }
    return list.map(n => ({ ...n, label: n.label ?? facts[n.id].fullName }));
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

/** Pages of a record that belongs to one network (datasets, monitor sessions, reading groups): none has a counterpart on another. */
export function isNetworkRecordPath(pathname: string): boolean {
  return pathname.startsWith("/datasets/") || pathname.startsWith("/about/data/");
}

export function rememberNetwork(id: string) {
  document.cookie = `${NETWORK_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
}

/** Facts for a configured network id; NEXT_PUBLIC_NETWORKS only takes known ids. Deployments configured before the selector watch Betanet. */
export function networkFacts(id: string | null | undefined): NetworkFacts {
  return (id && facts[id]) || facts.betanet;
}

/** A readable name for the network the API reports, e.g. "eCash Betanet". */
export function networkLabel(id: string | null | undefined): string {
  const known = networks.find(n => n.id === id);
  if (known) return known.label;
  if (process.env.NEXT_PUBLIC_NETWORK_LABEL) return process.env.NEXT_PUBLIC_NETWORK_LABEL;
  if (id && facts[id]) return facts[id].fullName;
  return id ?? "Unknown network";
}
