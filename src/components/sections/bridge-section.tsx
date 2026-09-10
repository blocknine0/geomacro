import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BRIDGE_SOURCE_CHAINS,
  estimateBridgeToArc,
  executeBridgeToArc,
  type BridgeEstimate,
  type BridgeExecutionResult,
  type BridgeSourceKey,
} from "@/lib/bridge-app-kit";
import { CCTP_CHAINS } from "@/lib/cctp";
import { recordTxHistory } from "@/lib/tx-history.functions";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
}

function getEthereum() {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum ?? null;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function safeTxUrl(explorerUrl: string, hash: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return undefined;
  try {
    const base = new URL(explorerUrl);
    return new URL(`/tx/${hash}`, `${base.origin}/`).toString();
  } catch {
    return undefined;
  }
}

export function BridgeSection() {
  const [sourceKey, setSourceKey] = useState<BridgeSourceKey>("ethSepolia");
  const sourceMeta = CCTP_CHAINS[sourceKey];
  const [address, setAddress] = useState<string | null>(null);
  const [currentChainIdHex, setCurrentChainIdHex] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [amount, setAmount] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<BridgeEstimate | null>(null);
  const [bridging, setBridging] = useState(false);
  const [result, setResult] = useState<BridgeExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSourceChain = currentChainIdHex?.toLowerCase() === sourceMeta.chainIdHex.toLowerCase();

  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;
    eth.request({ method: "eth_accounts" }).then((accounts) => {
      const list = accounts as string[];
      setAddress(list[0] ?? null);
    }).catch(() => undefined);
    eth.request({ method: "eth_chainId" }).then((chainId) => setCurrentChainIdHex(String(chainId))).catch(() => undefined);

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) ?? [];
      setAddress(accounts[0] ?? null);
    };
    const onChainChanged = (...args: unknown[]) => setCurrentChainIdHex(String(args[0] ?? ""));
    eth.on("accountsChanged", onAccountsChanged);
    eth.on("chainChanged", onChainChanged);
    return () => {
      eth.removeListener("accountsChanged", onAccountsChanged);
      eth.removeListener("chainChanged", onChainChanged);
    };
  }, []);

  useEffect(() => {
    setEstimate(null);
    setResult(null);
    setError(null);
    if (!address || !onSourceChain || !amount || Number(amount) <= 0) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setEstimating(true);
      try {
        const next = await estimateBridgeToArc(sourceKey, amount, address);
        if (!cancelled) setEstimate(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not estimate bridge fees.");
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, onSourceChain, sourceKey, amount]);

  const connect = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) {
      setError("No EVM wallet detected. Install MetaMask or another browser wallet.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
      setAddress(accounts[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection failed.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchToSource = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;
    setError(null);
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: sourceMeta.chainIdHex }],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch network.");
    }
  }, [sourceMeta.chainIdHex]);

  async function handleBridge() {
    if (!address) return;
    if (!amount || Number(amount) <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (!estimate) {
      setError("Wait for the current Circle bridge estimate before confirming.");
      return;
    }

    setBridging(true);
    setError(null);
    setResult(null);
    try {
      const next = await executeBridgeToArc(sourceKey, amount, address);
      setResult(next);
      if (next.state === "error") {
        const failedStep = next.steps.find((step) => step.state === "error");
        setError(failedStep?.errorMessage || "Circle bridge returned an error state.");
        return;
      }

      const primaryHash = next.mintTxHash || next.burnTxHash;
      if (next.state === "success" && primaryHash) {
        try {
          await recordTxHistory({
            data: {
              walletAddress: address,
              type: "bridge",
              txHash: primaryHash,
              tokenIn: "USDC",
              tokenOut: "USDC",
              amountIn: amount,
              feeUsdc: estimate.geomacroFeeUsdc,
              explorerUrl: next.mintTxHash
                ? safeTxUrl(CCTP_CHAINS.arcTestnet.explorerUrl, next.mintTxHash)
                : safeTxUrl(sourceMeta.explorerUrl, next.burnTxHash || ""),
            },
          });
        } catch (historyErr) {
          console.error("[BridgeSection] recordTxHistory failed", historyErr);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bridge failed.");
    } finally {
      setBridging(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-card/40 p-6 space-y-6">
        <div>
          <p className="text-sm font-medium">Bridge USDC to Arc Testnet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Circle App Kit handles CCTP V2 burn, attestation and destination forwarding. Geomacro's fee is collected as USDC inside the source bridge flow.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3">
          <div className="text-sm">
            <div className="font-mono">Wallet</div>
            <div className="text-xs text-muted-foreground">{address ?? "Not connected"}</div>
          </div>
          {!address ? (
            <Button size="sm" onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
            </Button>
          ) : !onSourceChain ? (
            <Button size="sm" variant="secondary" onClick={() => void switchToSource()}>Switch to source</Button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="Amount USDC"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Select value={sourceKey} onValueChange={(value) => setSourceKey(value as BridgeSourceKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(BRIDGE_SOURCE_CHAINS).map(([key, chain]) => (
                <SelectItem key={key} value={key}>{chain.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {estimating && <p className="text-xs text-muted-foreground">Fetching Circle bridge estimate…</p>}

        {estimate && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Bridge amount</span>
              <span className="font-mono">{amount} USDC</span>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-muted-foreground">Geomacro fee</span>
              <span className="font-mono">{estimate.geomacroFeeUsdc} USDC</span>
            </div>
            {estimate.fees.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <p className="mb-2 text-muted-foreground">Circle fee breakdown</p>
                {estimate.fees.map((fee, index) => (
                  <div key={`${fee.type}-${index}`} className="flex justify-between gap-4">
                    <span>{fee.type}</span>
                    <span className="font-mono">{fee.amount ?? "unavailable"} {fee.token}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
              App Kit requests batched approve/burn calls when the wallet supports EIP-5792. Circle Forwarding Service handles the Arc mint, so there is no separate Geomacro post-mint fee transaction.
            </p>
          </div>
        )}

        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        <Button className="w-full" disabled={!address || !onSourceChain || !estimate || estimating || bridging} onClick={handleBridge}>
          {bridging ? <Loader2 className="h-4 w-4 animate-spin" /> : "Bridge to Arc"}
        </Button>

        {result && result.state !== "error" && (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-4 text-sm">
            <p className="flex items-center gap-2 text-primary">
              {result.state === "success" ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
              {result.state === "success" ? "Bridge completed." : "Bridge is pending."}
            </p>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              {result.steps.filter((step) => step.txHash).map((step) => {
                const explorer = step.explorerUrl || (step.name === "mint"
                  ? safeTxUrl(CCTP_CHAINS.arcTestnet.explorerUrl, step.txHash || "")
                  : safeTxUrl(sourceMeta.explorerUrl, step.txHash || ""));
                return (
                  <div key={`${step.name}-${step.txHash}`} className="flex items-center justify-between gap-3">
                    <span>{step.name}{step.batched ? " · batched" : ""}{step.forwarded ? " · forwarded" : ""}</span>
                    {explorer ? (
                      <a href={explorer} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                        {shortHash(step.txHash || "")} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : <span className="font-mono">{shortHash(step.txHash || "")}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
