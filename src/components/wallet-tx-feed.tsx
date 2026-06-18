import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCcw, ExternalLink, Wallet } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { fetchWalletTxs, loadSessionTxs, mergeTxs, type WalletTx } from "@/lib/wallet-tx";
import { fetchNativeBalance } from "@/lib/balance";
import { preferredNetwork } from "@/lib/arc";

function short(s: string, head = 6, tail = 4) {
  if (!s) return "";
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function ts(t: number | null) {
  if (!t) return "—";
  const d = new Date(t * 1000);
  return d.toUTCString().slice(5, 22);
}

export function WalletTxFeed() {
  const { address, network, connect, switchToArc } = useWallet();
  const active = network ?? preferredNetwork();
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setErr(null);
    try {
      const [explorer, bal] = await Promise.all([
        fetchWalletTxs(active, address),
        fetchNativeBalance(active, address),
      ]);
      const session = loadSessionTxs(active, address);
      setTxs(mergeTxs(explorer, session));
      setBalance(bal ? bal.formatted : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [active, address]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (!address) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
        <Wallet className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Connect a wallet to see every ARC transaction it signs — in real time.
        </p>
        <Button onClick={connect} className="mt-4 gap-2">
          <Wallet className="h-4 w-4" /> Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Wallet transactions</h3>
            <Badge variant="outline" className="text-[10px] font-mono">
              {active.chainName}
            </Badge>
            {!network && (
              <Button size="sm" variant="link" onClick={() => void switchToArc(active)} className="h-6 px-1 text-primary">
                switch →
              </Button>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {short(address, 10, 6)} · auto-refresh 30s
          </p>
          {balance !== null && (
            <p className="mt-1 font-mono text-xs">
              <span className="text-foreground">{balance}</span>{" "}
              <span className="text-muted-foreground">USDC · native gas</span>
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {err && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="mt-4 max-h-[420px] overflow-y-auto rounded-lg border border-border/40">
        {txs.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            {loading
              ? "Loading on-chain history…"
              : "No transactions yet. Sign an attestation, stake, or publish — it'll appear here in 30s."}
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {txs.map((tx) => (
              <li key={tx.hash} className="flex items-center gap-3 p-3 hover:bg-background/40">
                <Badge
                  variant={tx.source === "explorer" ? "default" : "secondary"}
                  className="shrink-0 text-[9px]"
                  title={tx.source === "explorer" ? "Confirmed on-chain" : "Signed this session"}
                >
                  {tx.source === "explorer" ? "on-chain" : "session"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <a
                    href={`${active.explorer}/tx/${tx.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-mono text-xs text-primary hover:underline"
                  >
                    {tx.hash}
                  </a>
                  <div className="mt-0.5 flex gap-2 font-mono text-[10px] text-muted-foreground">
                    <span>{ts(tx.timestamp)}</span>
                    <span>·</span>
                    <span>to {short(tx.to ?? "—")}</span>
                    {tx.blockNumber != null && <><span>·</span><span>blk {tx.blockNumber}</span></>}
                  </div>
                </div>
                <a
                  href={`${active.explorer}/tx/${tx.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}