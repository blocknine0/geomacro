import { useEffect, useState } from "react";
import { ArrowDownUp, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallet } from "@/hooks/WalletProvider";
import {
  ARC_SWAP_TOKENS,
  DEFAULT_SWAP_SLIPPAGE_BPS,
  MAX_SWAP_SLIPPAGE_BPS,
  MIN_SWAP_SLIPPAGE_BPS,
  checkArcSwapStatus,
  clearPendingSwapIntent,
  estimateArcSwap,
  executeArcSwap,
  loadPendingSwapIntent,
  type ArcSwapToken,
  type PendingSwapIntent,
  type SwapQuote,
  type SwapResult,
} from "@/lib/swap";
import { recordTxHistory } from "@/lib/tx-history.functions";

function arcscanTxUrl(hash: string) {
  return `https://testnet.arcscan.app/tx/${hash}`;
}

function arcscanAddressUrl(addr: string) {
  return `https://testnet.arcscan.app/address/${addr}`;
}

const SLIPPAGE_PRESETS = [50, 100, 200, 300, 500] as const;

export function SwapSection() {
  const { address, onArc, connect, connecting, switchToArc } = useWallet();
  const [tokenIn, setTokenIn] = useState<ArcSwapToken>("USDC");
  const [tokenOut, setTokenOut] = useState<ArcSwapToken>("EURC");
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SWAP_SLIPPAGE_BPS);
  const [customSlippage, setCustomSlippage] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PendingSwapIntent | null>(null);
  const [checkTxInput, setCheckTxInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  useEffect(() => {
    setPendingIntent(loadPendingSwapIntent());
  }, []);

  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!address || !onArc || !amountIn || Number(amountIn) <= 0) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setQuoting(true);
      try {
        const next = await estimateArcSwap({ tokenIn, tokenOut, amountIn, slippageBps });
        if (!cancelled) setQuote(next);
      } catch (e) {
        if (!cancelled) setQuoteError(e instanceof Error ? e.message : "Could not fetch swap quote.");
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, onArc, amountIn, tokenIn, tokenOut, slippageBps]);

  async function handleCheckStatus() {
    if (!checkTxInput.trim()) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const status = await checkArcSwapStatus(checkTxInput.trim());
      setCheckResult(
        status.status === "DONE"
          ? `Completed${status.amountOut ? ` · received ${status.amountOut}` : ""}.`
          : status.status === "FAILED"
            ? "This swap failed on-chain."
            : status.status === "NOT_FOUND"
              ? "No swap found for that tx hash."
              : "Still pending. Check again in a moment.",
      );
    } catch (e) {
      setCheckResult(e instanceof Error ? e.message : "Couldn't check status.");
    } finally {
      setChecking(false);
    }
  }

  function chooseTokenIn(value: ArcSwapToken) {
    setTokenIn(value);
    if (value !== "USDC") setTokenOut("USDC");
    else if (tokenOut === "USDC") setTokenOut("EURC");
    setResult(null);
  }

  function chooseTokenOut(value: ArcSwapToken) {
    setTokenOut(value);
    if (value !== "USDC") setTokenIn("USDC");
    else if (tokenIn === "USDC") setTokenIn("EURC");
    setResult(null);
  }

  function flipTokens() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setResult(null);
    setQuote(null);
    setQuoteError(null);
  }

  function applyCustomSlippage() {
    const percent = Number(customSlippage);
    if (!Number.isFinite(percent)) return;
    const next = Math.round(percent * 100);
    setSlippageBps(Math.min(MAX_SWAP_SLIPPAGE_BPS, Math.max(MIN_SWAP_SLIPPAGE_BPS, next)));
  }

  async function handleSwap() {
    setError(null);
    setResult(null);
    const amount = Number(amountIn);
    if (!amount || amount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (!quote) {
      setError("Wait for a current Circle swap quote before confirming.");
      return;
    }

    setSwapping(true);
    try {
      const res = await executeArcSwap({
        tokenIn,
        tokenOut,
        amountIn,
        slippageBps: quote.slippageBps,
        minimumOutput: quote.minimumOutput,
        geomacroFeeUsdc: quote.geomacroFeeUsdc,
      });
      setResult(res);

      if (res.status !== "DONE") {
        setPendingIntent(loadPendingSwapIntent());
        return;
      }

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
          console.error("[SwapSection] recordTxHistory failed", historyErr);
        }
      }

      setAmountIn("");
      setQuote(null);
      setPendingIntent(null);
    } catch (e) {
      console.error("[SwapSection] swap failed", e);
      setError(e instanceof Error ? e.message : "Swap failed. Try again.");
      setPendingIntent(loadPendingSwapIntent());
    } finally {
      setSwapping(false);
    }
  }

  const outputOptions = tokenIn === "USDC"
    ? ARC_SWAP_TOKENS.filter((token) => token !== "USDC")
    : (["USDC"] as ArcSwapToken[]);
  const inputOptions = tokenOut === "USDC"
    ? ARC_SWAP_TOKENS.filter((token) => token !== "USDC")
    : (["USDC"] as ArcSwapToken[]);

  return (
    <div className="space-y-4">
      {pendingIntent && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-500">Unconfirmed swap from a previous session</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You started a {pendingIntent.amountIn} {pendingIntent.tokenIn} → {pendingIntent.tokenOut} swap. Check your{" "}
            {address ? (
              <a href={arcscanAddressUrl(address)} target="_blank" rel="noreferrer" className="underline">wallet on Arcscan</a>
            ) : "wallet on Arcscan"}, or paste the transaction hash below.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input placeholder="0x..." value={checkTxInput} onChange={(e) => setCheckTxInput(e.target.value)} className="max-w-xs font-mono text-xs" />
            <Button size="sm" onClick={handleCheckStatus} disabled={checking || !checkTxInput.trim()}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check status"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => {
              clearPendingSwapIntent();
              setPendingIntent(null);
              setCheckResult(null);
            }}>Dismiss</Button>
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
            <Button size="sm" onClick={connect} disabled={connecting}>{connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}</Button>
          ) : !onArc ? (
            <Button size="sm" variant="secondary" onClick={() => void switchToArc()}>Switch to Arc</Button>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-border/60 p-4">
            <div className="text-xs text-muted-foreground">You pay</div>
            <div className="mt-2 flex gap-3">
              <Input type="number" min="0" step="any" placeholder="0.00" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} className="font-mono" />
              <Select value={tokenIn} onValueChange={(v) => chooseTokenIn(v as ArcSwapToken)}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{inputOptions.map((token) => <SelectItem key={token} value={token}>{token}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={flipTokens} aria-label="Flip tokens"><ArrowDownUp className="h-4 w-4" /></Button>
          </div>

          <div className="rounded-md border border-border/60 p-4">
            <div className="text-xs text-muted-foreground">You receive (estimate)</div>
            <div className="mt-2 flex gap-3">
              <Input type="text" disabled value={quote?.estimatedOutput ?? ""} placeholder={quoting ? "Fetching quote..." : "—"} className="font-mono text-muted-foreground" />
              <Select value={tokenOut} onValueChange={(v) => chooseTokenOut(v as ArcSwapToken)}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{outputOptions.map((token) => <SelectItem key={token} value={token}>{token}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-border/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Slippage tolerance</span>
              <span className="font-mono text-xs">{(slippageBps / 100).toFixed(2)}%</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SLIPPAGE_PRESETS.map((bps) => (
                <Button key={bps} type="button" size="sm" variant={slippageBps === bps ? "default" : "outline"} onClick={() => {
                  setCustomSlippage("");
                  setSlippageBps(bps);
                }}>{bps / 100}%</Button>
              ))}
              <div className="flex gap-2">
                <Input type="number" min="0.5" max="5" step="0.1" placeholder="Custom %" value={customSlippage} onChange={(e) => setCustomSlippage(e.target.value)} onBlur={applyCustomSlippage} className="w-28" />
                <Button type="button" size="sm" variant="outline" onClick={applyCustomSlippage}>Apply</Button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Allowed range: 0.5% to 5%.</p>
          </div>

          {quote && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-xs">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Estimated receive</span><span className="font-mono">{quote.estimatedOutput} {tokenOut}</span></div>
              <div className="mt-2 flex justify-between gap-4"><span className="text-muted-foreground">Minimum receive</span><span className="font-mono">{quote.minimumOutput} {tokenOut}</span></div>
              {quote.fees.length > 0 && (
                <div className="mt-3 border-t border-border/60 pt-3">
                  <p className="mb-2 text-muted-foreground">Circle route fees</p>
                  {quote.fees.map((fee, index) => (
                    <div key={`${fee.type}-${index}`} className="flex justify-between gap-4"><span className="capitalize">{fee.type}</span><span className="font-mono">{fee.amount ?? "unavailable"} {fee.token}</span></div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex justify-between gap-4 border-t border-border/60 pt-3"><span className="text-muted-foreground">Geomacro fee</span><span className="font-mono">${quote.geomacroFeeUsdc} USDC</span></div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {quote.feeMode === "circle_custom_fee" ? "Collected inside the Circle swap flow. No separate Geomacro fee transaction." : "Reverse swaps keep the Geomacro fee USDC-only, so the fee is collected after the swap completes."}
              </p>
            </div>
          )}

          {quoteError && Number(amountIn) > 0 && <p className="text-xs text-destructive">{quoteError}</p>}
        </div>

        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        {!result ? (
          <Button className="w-full" disabled={!address || !onArc || swapping || quoting || !quote} onClick={handleSwap}>
            {swapping ? <Loader2 className="h-4 w-4 animate-spin" /> : `Swap ${tokenIn} → ${tokenOut}`}
          </Button>
        ) : result.status !== "DONE" ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            <p className="font-medium text-amber-500">Swap submitted and still pending.</p>
            <a href={arcscanTxUrl(result.txHash)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline">View transaction <ExternalLink className="h-3 w-3" /></a>
          </div>
        ) : (
          <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-primary"><CheckCircle2 className="h-4 w-4" /> Swap completed.</p>
              <a href={arcscanTxUrl(result.txHash)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs underline">View tx <ExternalLink className="h-3 w-3" /></a>
            </div>
            {result.amountOut && <p className="mt-2 text-xs text-muted-foreground">Received: {result.amountOut} {tokenOut}</p>}
            {result.feeUsdc && <p className="mt-1 text-xs text-muted-foreground">Geomacro fee: ${result.feeUsdc} USDC{result.feeMode === "circle_custom_fee" ? " · included in swap flow" : ""}</p>}
            {result.feeError && (
              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-medium text-amber-500">Swap succeeded, but the USDC protocol fee did not complete.</p>
                <p className="mt-1 text-muted-foreground">{result.feeError}</p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">Powered by Circle App Kit. Geomacro allows only USDC ↔ EURC and USDC ↔ cirBTC pairs on Arc Testnet.</p>
      </div>
    </div>
  );
}
