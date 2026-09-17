import { Activity, ShieldCheck, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ARC_NETWORKS } from "@/lib/arc";
import { useWallet } from "@/hooks/WalletProvider";
import { Row, SectionHeader, shortAddr } from "@/components/section-ui";
import { WalletTxFeed } from "@/components/wallet-tx-feed";

export function OnchainSection() {
  const { address, onArc, network, switchToArc } = useWallet();
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 md:py-24">
      <SectionHeader
        eyebrow="Onchain"
        title="Arc technical proof"
        desc="Arc public mainnet launched on 16 Sep 2026. Geomacro still uses Arc Testnet for its onchain technical-proof surfaces; Geomacro mainnet transaction features remain intentionally disabled until a separately approved production configuration is activated."
      />
      <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          {ARC_NETWORKS.map((n) => {
            const badgeLabel = n.live ? "Geomacro enabled" : n.key === "mainnet" ? "public network live · Geomacro disabled" : "Geomacro disabled";
            return (
              <div
                key={n.key}
                className={`rounded-2xl border p-5 sm:p-6 ${network?.key === n.key ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card/40"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{n.key}</h3>
                  <Badge variant={n.live ? "default" : "secondary"} className="text-[10px]">
                    {badgeLabel}
                  </Badge>
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <Row k="Network" v={n.chainName} />
                  <Row k="Chain ID" v={`${n.chainIdDec} (${n.chainIdHex})`} />
                  <Row k="Currency" v={n.currency.symbol} />
                  <Row k="Explorer" v={n.explorer} mono />
                </dl>
                {address && network?.key !== n.key && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void switchToArc(n)}
                    disabled={!n.live && n.key === "mainnet"}
                    className="mt-4 gap-1.5"
                  >
                    <Zap className="h-3.5 w-3.5" /> Switch to {n.chainName}
                  </Button>
                )}
                {n.faucet && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="ghost" asChild className="h-7 gap-1.5 px-2 text-xs">
                      <a href={n.faucet} target="_blank" rel="noreferrer">
                        <Zap className="h-3 w-3" /> Get test USDC
                      </a>
                    </Button>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Testnet USDC · technical proof only
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {address && (
            <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Connected: <span className="font-mono">{shortAddr(address)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-primary" />
                {onArc ? `On ${network?.chainName}` : "Not on an Arc network enabled by Geomacro"}
              </div>
            </div>
          )}
        </div>
        <WalletTxFeed />
      </div>
    </section>
  );
}
