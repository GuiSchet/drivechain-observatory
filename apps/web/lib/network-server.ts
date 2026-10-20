import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiFailure } from "@/lib/api";
import { NETWORK_COOKIE, type Network, networks, resolveNetwork } from "@/lib/network";

/** The network a server-rendered request asks for: `?network=`, then the reader's cookie, then the default. */
export async function requestNetwork(param: string | string[] | undefined): Promise<Network> {
  if (typeof param === "string" && networks.some(n => n.id === param)) return resolveNetwork(param);
  return resolveNetwork((await cookies()).get(NETWORK_COOKIE)?.value);
}

/**
 * Reads a dataset's record from the reader's network. A dataset belongs to one network, so when that API
 * does not know it, a permalink shared from another network is sent there with `?network=`.
 */
export async function readDataset<T>(network: Network, path: string, read: (base: string) => Promise<T>): Promise<T | null> {
  try {
    return await read(network.apiBaseUrl);
  } catch (error) {
    if (!(error instanceof ApiFailure && (error.status === 404 || error.status === 400))) return null;
  }
  for (const other of networks) {
    if (other.id === network.id) continue;
    if (await read(other.apiBaseUrl).then(() => true, () => false)) redirect(`${path}?network=${encodeURIComponent(other.id)}`);
  }
  return null;
}
