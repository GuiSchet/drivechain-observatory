import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NETWORK_COOKIE, type Network, networks, resolveNetwork } from "@/lib/network";

/** The network a server-rendered request asks for: `?network=`, then the reader's cookie, then the default. */
export async function requestNetwork(param: string | string[] | undefined): Promise<Network> {
  if (typeof param === "string" && networks.some(n => n.id === param)) return resolveNetwork(param);
  return resolveNetwork((await cookies()).get(NETWORK_COOKIE)?.value);
}

/** `href` with `?network=` set, keeping its other query parameters. */
function onNetwork(href: string, id: string): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("network", id);
  return `${path}?${params}`;
}

/**
 * Reads a record that belongs to one network from the reader's. When that API cannot return it, because the
 * record is not there or because the API is down, a permalink shared from another network is sent there.
 */
export async function readRecord<T>(network: Network, href: string, read: (base: string) => Promise<T>): Promise<T | null> {
  try {
    return await read(network.apiBaseUrl);
  } catch {
    // Look on the other networks below.
  }
  for (const other of networks) {
    if (other.id === network.id) continue;
    if (await read(other.apiBaseUrl).then(() => true, () => false)) redirect(onNetwork(href, other.id));
  }
  return null;
}
