import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, formatUnits, parseUnits } from "ethers";
import { ArrowRight, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CCTP_CHAINS,
  TOKEN_MESSENGER_V2,
  MESSAGE_TRANSMITTER_V2,
  FINALITY_FAST,
  BYTES32_ZERO,
  addressToBytes32,
  pollIrisAttestation,
  getUsdcContract,
  getTokenMessengerContract,
  getMessageTransmitterContract,
  type CctpChain,
  type IrisMessage,
} from "@/lib/cctp";

const DEST = CCTP_CHAINS.arcTestnet;
const SOURCE_OPTIONS = Object.entries(CCTP_CHAINS).filter(([key]) => key !== "arcTestnet") as [
  string,
  CctpChain,
][];

type Phase = "idle" | "approving" | "burning" | "attesting" | "minting" | "done";

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function getEthereum() {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum ?? null;
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
}

export function BridgeSection() {
  const [sourceKey, setSourceKey] = useState<string>(SOURCE_OPTIONS[0][0]);
  const source = CCTP_CHAINS[sourceKey];

  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [currentChainIdHex, setCurrentChainIdHex] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);

  const [phase, setPhase] = useState<Phase>("idle");
  const [burnTxHash, setBurnTxHash] = useState<string | null>(null);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  const [irisMessage, setIrisMessage] = useState<IrisMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountUnits = (() => {
    try {
      return amount ? parseUnits(amount, 6) : 0n; // source-chain USDC is standard 6-decimal ERC-20
    } catch {
      return 0n;
    }
  })();
  const needsApproval = allowance < amountUnits;
  const onSourceChain = currentChainIdHex?.toLowerCase() === source.chainIdHex.toLowerCase();
  const onArc = currentChainIdHex?.toLowerCase() === DEST.chainIdHex.toLowerCase();

  // -- wallet connect + chain tracking ---------------------------------------
  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;
    eth.request({ method: "eth_accounts" }).then((accs) => {
      const a = accs as string[];
      if (a[0]) setAddress(a[0]);
    });
    eth.request({ method: "eth_chainId" }).then((id) => setCurrentChainIdHex(id as string));

    const onAccountsChanged = (...args: unknown[]) => {
      const accs = args[0] as string[];
      setAddress(accs[0] ?? null);
    };
    const onChainChanged = (...args: unknown[]) => setCurrentChainIdHex(args[0] as string);
    eth.on("accountsChanged", onAccountsChanged);
    eth.on("chainChanged", onChainChanged);
    return () => {
      eth.removeListener("accountsChanged", onAccountsChanged);
      eth.removeListener("chainChanged", onChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) {
      setError("No EVM wallet detected. Install MetaMask or another browser wallet.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accs = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accs[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchToChain = useCallback(async (chain: CctpChain) => {
    const eth = getEthereum();
    if (!eth) return;
    setError(null);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainIdHex }] });
    } catch (switchErr) {
      // 4902 = chain not yet added to the wallet
      if ((switchErr as { code?: number })?.code === 4902 && chain.rpcUrl) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: chain.chainIdHex,
            chainName: chain.name,
            rpcUrls: [chain.rpcUrl],
            blockExplorerUrls: [chain.explorerUrl],
            nativeCurrency: chain.name === "Arc Testnet"
              ? { name: "USDC", symbol: "USDC", decimals: 18 }
              : { name: "ETH", symbol: "ETH", decimals: 18 },
          }],
        });
      } else {
        setError((switchErr as Error).message ?? "Failed to switch network");
      }
    }
  }, []);

  // -- balance/allowance refresh once wallet is on the source chain ---------
  const refreshBalanceAndAllowance = useCallback(async () => {
    if (!address || !onSourceChain) return;
    const eth = getEthereum();
    if (!eth) return;
    const provider = new BrowserProvider(eth as never);
    const usdc = getUsdcContract(source, provider);
    const [bal, allow] = await Promise.all([
      usdc.balanceOf(address) as Promise<bigint>,
      usdc.allowance(address, TOKEN_MESSENGER_V2) as Promise<bigint>,
    ]);
    setBalance(bal);
    setAllowance(allow);
  }, [address, onSourceChain, source]);

  useEffect(() => {
    void refreshBalanceAndAllowance();
  }, [refreshBalanceAndAllowance]);

  // -- step handlers -----------------------------------------------------------
  const handleApprove = useCallback(async () => {
    if (!address) return;
    setError(null);
    setPhase("approving");
    try {
      const eth = getEthereum()!;
      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const usdc = getUsdcContract(source, signer);
      const tx = await usdc.approve(TOKEN_MESSENGER_V2, amountUnits);
      await tx.wait();
      await refreshBalanceAndAllowance();
      setPhase("idle");
    } catch (e) {
      setError((e as Error).message ?? "Approve failed");
      setPhase("idle");
    }
  }, [address, source, amountUnits, refreshBalanceAndAllowance]);

  const handleBurn = useCallback(async () => {
    if (!address) return;
    if (amountUnits <= 0n) {
      setError("Enter a positive amount");
      return;
    }
    if (balance < amountUnits) {
      setError("Insufficient USDC balance on source chain");
      return;
    }
    setError(null);
    setPhase("burning");
    try {
      const eth = getEthereum()!;
      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const tokenMessenger = getTokenMessengerContract(signer);
      const tx = await tokenMessenger.depositForBurn(
        amountUnits,
        DEST.domain,
        addressToBytes32(address),
        source.usdc,
        BYTES32_ZERO, // destinationCaller = permissionless, anyone can relay the mint
        amountUnits / 1000n, // maxFee = 0.1% for Fast Transfer
        FINALITY_FAST,
      );
      const receipt = await tx.wait();
      setBurnTxHash(receipt.hash);

      setPhase("attesting");
      const msg = await pollIrisAttestation(source.domain, receipt.hash, { network: "testnet" });
      setIrisMessage(msg);
      setPhase("idle"); // user now clicks "Switch to Arc & Mint"
    } catch (e) {
      setError((e as Error).message ?? "Burn failed");
      setPhase("idle");
    }
  }, [address, amountUnits, balance, source]);

  const handleMint = useCallback(async () => {
    if (!irisMessage) return;
    setError(null);
    setPhase("minting");
    try {
      const eth = getEthereum()!;
      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const messageTransmitter = getMessageTransmitterContract(signer);
      const tx = await messageTransmitter.receiveMessage(irisMessage.message, irisMessage.attestation);
      const receipt = await tx.wait();
      setMintTxHash(receipt.hash);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message ?? "Mint failed");
      setPhase("idle");
    }
  }, [irisMessage]);

  const reset = useCallback(() => {
    setBurnTxHash(null);
    setMintTxHash(null);
    setIrisMessage(null);
    setPhase("idle");
    setError(null);
  }, []);

  const busy = phase !== "idle" && phase !== "done";

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="max-w-xl">
        <h1 className="font-mono text-3xl tracking-tight">Bridge USDC to Arc</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Bring native USDC from Ethereum Sepolia, Base Sepolia, or Avalanche Fuji into Arc
          Testnet via Circle's CCTP burn-and-mint protocol. Fast Transfer mode, ~15s finality.
        </p>
      </div>

      <div className="mt-10 space-y-6 rounded-lg border border-border/60 bg-card/40 p-6">
        {/* wallet */}
        <div className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3">
          <div className="text-sm">
            <div className="font-mono">Wallet</div>
            <div className="text-xs text-muted-foreground">
              {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected"}
            </div>
          </div>
          <Button size="sm" variant={address ? "outline" : "default"} onClick={connect} disabled={connecting || !!address}>
            {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : address ? "Connected" : "Connect"}
          </Button>
        </div>

        {/* source + amount */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-mono text-muted-foreground">Source chain</label>
            <Select value={sourceKey} onValueChange={(v) => { setSourceKey(v); reset(); }} disabled={busy}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map(([key, chain]) => (
                  <SelectItem key={key} value={key}>
                    {chain.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground">Amount (USDC)</label>
            <Input
              className="mt-1.5"
              type="number"
              min="0"
              step="0.01"
              placeholder="10.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
            {address && onSourceChain && (
              <p className="mt-1 text-xs text-muted-foreground">
                Balance: {formatUnits(balance, 6)} USDC
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 py-1 text-xs font-mono text-muted-foreground">
          <span>{source.name}</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span>Arc Testnet</span>
        </div>

        {/* step-by-step flow */}
        {!irisMessage ? (
          <div className="space-y-3">
            {!onSourceChain ? (
              <Button className="w-full" variant="outline" onClick={() => switchToChain(source)} disabled={!address || busy}>
                Switch wallet to {source.name}
              </Button>
            ) : needsApproval ? (
              <Button className="w-full" onClick={handleApprove} disabled={!address || busy || amountUnits <= 0n}>
                {phase === "approving" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Approve USDC
              </Button>
            ) : (
              <Button className="w-full" onClick={handleBurn} disabled={!address || busy || amountUnits <= 0n}>
                {phase === "burning" || phase === "attesting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {phase === "attesting" ? "Waiting for attestation…" : "Burn & Bridge"}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {!onArc ? (
              <Button className="w-full" variant="outline" onClick={() => switchToChain(DEST)} disabled={busy}>
                Switch wallet to Arc Testnet
              </Button>
            ) : (
              <Button className="w-full" onClick={handleMint} disabled={busy || phase === "done"}>
                {phase === "minting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {phase === "done" ? "Minted" : "Mint on Arc"}
              </Button>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* tx links */}
        {(burnTxHash || mintTxHash) && (
          <div className="space-y-2 border-t border-border/60 pt-4 text-sm">
            {burnTxHash && (
              <a
                href={`${source.explorerUrl}/tx/${burnTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Burn tx: {shortHash(burnTxHash)} <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {mintTxHash && (
              <a
                href={`${DEST.explorerUrl}/tx/${mintTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Mint tx: {shortHash(mintTxHash)} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        {phase === "done" && (
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm text-emerald-500">
              <CheckCircle2 className="h-4 w-4" /> Bridge complete — USDC minted on Arc Testnet.
            </p>
            <Button size="sm" variant="ghost" onClick={reset}>
              Bridge more
            </Button>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Testnet only. You'll need testnet USDC on the source chain and native gas on both the
        source chain and Arc (also USDC on Arc) — get both from the{" "}
        <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer" className="underline">
          Circle Faucet
        </a>
        .
      </p>
    </main>
  );
}
