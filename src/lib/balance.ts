import { arcRpcUrls, type ArcNetwork } from "./arc";

// Per-RPC attempt timeout before failing over to the next endpoint in
// arcRpcUrls(). Matches the stallTimeout used by getArcReadProvider()'s
// ethers FallbackProvider so both read paths fail over on the same cadence.
const RPC_ATTEMPT_TIMEOUT_MS = 2500;

async function rpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_ATTEMPT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`RPC ${url} returned HTTP ${res.status}`);

    const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (json.error) throw new Error(json.error.message ?? `RPC ${url} returned an error`);
    if (json.result === undefined) throw new Error(`RPC ${url} returned no result`);

    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read the native USDC balance for an address on an Arc network.
 * Uses `eth_getBalance` and formats the result with the network's decimals
 * (Arc native USDC = 18 decimals).
 *
 * Tries every RPC URL in arcRpcUrls() in order, failing over to the next
 * one on timeout/error, so a single rate-limited or momentarily-down
 * endpoint doesn't surface as a broken balance in the UI.
 */
export async function fetchNativeBalance(
  network: ArcNetwork,
  address: string,
): Promise<{ raw: bigint; formatted: string } | null> {
  let lastErr: unknown = null;

  for (const url of arcRpcUrls(network)) {
    try {
      const result = await rpcCall(url, "eth_getBalance", [address, "latest"]);
      const raw = BigInt(result as string);
      return { raw, formatted: formatUnits(raw, network.currency.decimals) };
    } catch (err) {
      lastErr = err;
      // try the next RPC in the list
    }
  }

  console.warn(
    `[fetchNativeBalance] all RPC endpoints failed for ${network.key}:`,
    (lastErr as Error)?.message ?? lastErr,
  );
  return null;
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
