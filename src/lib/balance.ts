import type { ArcNetwork } from "./arc";

/**
 * Read the native USDC balance for an address on an Arc network.
 * Uses `eth_getBalance` against the network's RPC URL and formats the
 * result with the network's decimals (Arc native USDC = 18 decimals).
 */
export async function fetchNativeBalance(
  network: ArcNetwork,
  address: string,
): Promise<{ raw: bigint; formatted: string } | null> {
  try {
    const res = await fetch(network.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string };
    if (!json.result) return null;
    const raw = BigInt(json.result);
    return { raw, formatted: formatUnits(raw, network.currency.decimals) };
  } catch {
    return null;
  }
}

/** Format a bigint to a fixed-decimal string with at most 4 fractional digits. */
export function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  if (frac === 0n) return (negative ? "-" : "") + whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return (negative ? "-" : "") + whole.toString() + (fracStr ? "." + fracStr : "");
}