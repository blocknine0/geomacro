import { useEffect, useState } from "react";
import { ArrowLeftRight, ExternalLink, Loader2, Repeat } from "lucide-react";
import { useWallet } from "@/hooks/WalletProvider";
import { getMyTxHistory, type TxHistoryRow } from "@/lib/tx-history.functions";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TxHistorySection() {
  const { address } = useWallet();
  const [entries, setEntries] = useState<TxHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMyTxHistory({ data: { walletAddress: address } })
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((e) => {
        console.error("[TxHistorySection] load failed", e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address) {
    return (
      <div className="mx-auto mt-10 max-w-3xl px-6">
        <p className="text-center text-sm text-muted-foreground">Connect your wallet to see your bridge and swap history.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-3xl px-6 pb-16">
      <h2 className="font-mono text-lg tracking-tight">History</h2>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No bridge or swap transactions yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {entries.map((entry) => (
            <div
              key={`${entry.type}-${entry.tx_hash}`}
              className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-3">
                {entry.type === "bridge" ? (
                  <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="font-mono">
                    {entry.type === "bridge"
                      ? `Bridge ${entry.amount_in} ${entry.token_in} → Arc`
                      : `Swap ${entry.amount_in} ${entry.token_in} → ${entry.token_out}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(entry.created_at)}
                    {entry.fee_usdc ? ` · fee $${entry.fee_usdc}` : ""}
                  </p>
                </div>
              </div>
              <a
                href={entry.explorer_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
              >
                View tx <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Synced to your wallet address — visible from any device you connect this wallet on.
      </p>
    </div>
  );
}
