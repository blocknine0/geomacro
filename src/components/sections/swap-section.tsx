import { useEffect, useState } from "react";
import { ArrowDownUp, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallet } from "@/hooks/WalletProvider";
import {
  ARC_SWAP_TOKENS,
  checkArcSwapStatus,
  clearPendingSwapIntent,
  executeArcSwap,
  loadPendingSwapIntent,
  previewSwapFeeUsdc,
  type ArcSwapToken,
  type PendingSwapIntent,
} from "@/lib/swap";
import { recordTxHistory } from "@/lib/tx-history.functions";

function arcscanTxUrl(hash: string) {
  return `https://testnet.arcscan.app/tx/${hash}`;
}
function arcscanAddressUrl(addr: string) {
  return `https://testnet.arcscan.app/address/${addr}`;
}

export function SwapSection() {
  const { address, onArc, connect, connecting, switchToArc } = useWallet();
  const [tokenIn, setTokenIn] = useState<ArcSwapToken>("USDC");
  const [tokenOut, setTokenOut] = useState<ArcSwapToken>("EURC");
  const [amountIn, setAmountIn] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ txHash: string; amountOut?: string; feeUsdc: string } | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PendingSwapIntent | null>(null);
  const [checkTxInput, setCheckTxInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  useEffect(() => {
    setPendingIntent(loadPendingSwapIntent());
  }, []);

  async function handleCheckStatus() {
    if (!checkTxInput.trim()) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const status = await checkArcSwapStatus(checkTxInput.trim());
      setCheckResult(
        status.status === "DONE"
          ? `Completed${status.amountOut ? ` — received ${status.amountOut}` : ""}.`
          : status.status === "FAILED"
            ? "This swap failed on-chain."
            : status.status === "NOT_FOUND"
              ? "No swap found for that tx hash."
              : "Still pending — check again in a moment.",
      );
    } catch (e) {
      setCheckResult(e instanceof Error ? e.message : "Couldn't check status.");
    } finally {
      setChecking(false);
    }
  }

  function flipTokens() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setResult(null);
  }

  async function handleSwap() {
    setError(null);
    setResult(null);
    const amount = Number(amountIn);
    if (!amount || amount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setSwapping(true);
    try {
      const res = await executeArcSwap({ tokenIn, tokenOut, amountIn });
      setResult(res);
      if (address) {
        try {
          await recordTxHistory({
            data: {
              walletAddress: address,
              type: "swap",
              txHash: res.txHash,
              tokenIn,
              tokenOut,
              amountIn,
              amountOut: res.amountOut,
              feeTxHash: res.feeTxHash,
              feeUsdc: res.feeUsdc,
              explorerUrl: arcscanTxUrl(res.txHash),
            },
          });
        } catch (historyErr) {
          // The swap already succeeded — a history-recording failure
          // shouldn't be shown as if the swap itself failed.
          console.error("[SwapSection] recordTxHistory failed", historyErr);
        }
      }
      setAmountIn("");
      setPendingIntent(null);
    } catch (e) {
      console.error("[SwapSection] swap failed", e);
      setError(e instanceof Error ? e.message : "Swap failed — try again.");
      // The intent is still in localStorage (executeArcSwap only clears it on
      // a clean resolve) — an error here is ambiguous, the transaction may or
      // may not have landed on-chain, so surface the same resume banner.
      setPendingIntent(loadPendingSwapIntent());
    } finally {
      setSwapping(false);
    }
  }

  return (
    <div className="space-y-4">
      {pendingIntent && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-500">Unconfirmed swap from a previous session</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You started a {pendingIntent.amountIn} {pendingIntent.tokenIn} → {pendingIntent.tokenOut} swap that
            never confirmed in this browser, possibly due to a refresh. It may or may not have gone through — we
            don't have a transaction hash saved automatically for same-chain swaps. Check your{" "}
            {address ? (
              <a href={arcscanAddressUrl(address)} target="_blank" rel="noreferrer" className="underline">
                wallet on Arcscan
              </a>
            ) : (
              "wallet on Arcscan"
            )}
            , or paste the tx hash below if you have it:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              placeholder="0x..."
              value={checkTxInput}
              onChange={(e) => setCheckTxInput(e.target.value)}
              className="max-w-xs font-mono text-xs"
            />
            <Button size="sm" onClick={handleCheckStatus} disabled={checking || !checkTxInput.trim()}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check status"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearPendingSwapIntent();
                setPendingIntent(null);
                setCheckResult(null);
              }}
            >
              Dismiss
            </Button>
          </div>
          {checkResult && <p className="mt-2 text-sm">{checkResult}</p>}
        </div>
      )}

      <div className="mt-10 space-y-6 rounded-lg border border-border/60 bg-card/40 p-6">
        <div className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3">
          <div className="text-sm">
            <div className="font-mono">Wallet</div>
            <div className="text-xs text-muted-foreground">{address ?? "Not connected"}</div>
        </div>
        {!address ? (
          <Button size="sm" onClick={connect} disabled={connecting}>
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
          </Button>
        ) : !onArc ? (
          <Button size="sm" variant="secondary" onClick={() => void switchToArc()}>
            Switch to Arc
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="rounded-md border border-border/60 p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>You pay</span>
          </div>
          <div className="mt-2 flex gap-3">
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              className="font-mono"
            />
            <Select value={tokenIn} onValueChange={(v) => setTokenIn(v as ArcSwapToken)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARC_SWAP_TOKENS.filter((t) => t !== tokenOut).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {Number(amountIn) > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              + ${previewSwapFeeUsdc(amountIn)} protocol fee (charged separately, on top of this amount)
            </p>
          )}
        </div>

        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={flipTokens} aria-label="Flip tokens">
            <ArrowDownUp className="h-4 w-4" />
          </Button>
        </div>

        <div className="rounded-md border border-border/60 p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>You receive (estimate)</span>
          </div>
          <div className="mt-2 flex gap-3">
            <Input type="text" disabled placeholder="—" className="font-mono text-muted-foreground" />
            <Select value={tokenOut} onValueChange={(v) => setTokenOut(v as ArcSwapToken)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARC_SWAP_TOKENS.filter((t) => t !== tokenIn).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!result ? (
        <Button
          className="w-full"
          disabled={!address || !onArc || swapping}
          onClick={handleSwap}
        >
          {swapping ? <Loader2 className="h-4 w-4 animate-spin" /> : `Swap ${tokenIn} → ${tokenOut}`}
        </Button>
      ) : (
        <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-4 w-4" /> Swap submitted.
            </p>
            <a
              href={arcscanTxUrl(result.txHash)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs underline"
            >
              View tx <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Protocol fee paid: ${result.feeUsdc}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Powered by Circle's App Kit. Arc Testnet supports swaps between USDC, EURC, and cirBTC only.
      </p>
      </div>
    </div>
  );
}
