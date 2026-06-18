import type { ArcNetwork } from "./arc";

export type WalletTx = {
  hash: string;
  from: string;
  to: string | null;
  valueWei: string;
  timestamp: number | null; // unix seconds
  blockNumber: number | null;
  input: string;
  source: "explorer" | "session";
};

/** Try the etherscan-compatible API exposed by most block-explorer stacks
 * (Blockscout / Arcscan). Falls back to an empty list when unavailable. */
export async function fetchWalletTxs(network: ArcNetwork, address: string): Promise<WalletTx[]> {
  const url = `${network.explorer.replace(/\/$/, "")}/api?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=25`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { status?: string; result?: unknown };
    if (!Array.isArray(json.result)) return [];
    return (json.result as Array<Record<string, string>>).slice(0, 25).map((r) => ({
      hash: String(r.hash ?? ""),
      from: String(r.from ?? ""),
      to: r.to ? String(r.to) : null,
      valueWei: String(r.value ?? "0"),
      timestamp: r.timeStamp ? Number(r.timeStamp) : null,
      blockNumber: r.blockNumber ? Number(r.blockNumber) : null,
      input: String(r.input ?? "0x"),
      source: "explorer" as const,
    }));
  } catch (err) {
    console.warn("[wallet-tx] explorer fetch failed", err);
    return [];
  }
}

const SESSION_KEY = (addr: string, net: string) =>
  `geomacro.session-txs.${net}.${addr.toLowerCase()}`;

/** Persist locally-signed txs so they always appear, even when the
 * explorer API is offline or rate-limited. */
export function rememberSessionTx(network: ArcNetwork, address: string, tx: Omit<WalletTx, "source">) {
  if (typeof window === "undefined") return;
  const k = SESSION_KEY(address, network.key);
  const list = loadSessionTxs(network, address);
  list.unshift({ ...tx, source: "session" });
  localStorage.setItem(k, JSON.stringify(list.slice(0, 50)));
}

export function loadSessionTxs(network: ArcNetwork, address: string): WalletTx[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSION_KEY(address, network.key));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WalletTx[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Merge explorer + session txs by hash, explorer wins. */
export function mergeTxs(explorer: WalletTx[], session: WalletTx[]): WalletTx[] {
  const seen = new Set<string>();
  const out: WalletTx[] = [];
  for (const tx of [...explorer, ...session]) {
    const h = tx.hash.toLowerCase();
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(tx);
  }
  return out.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}