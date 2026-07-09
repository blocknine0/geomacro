import { useState } from "react";
import { LiveNewsFeed } from "@/components/live-news-feed";
import { SectionHeader } from "@/components/section-ui";
import { useWallet } from "@/hooks/WalletProvider";
import { preferredNetwork } from "@/lib/arc";
import { rememberSessionTx } from "@/lib/wallet-tx";
import type { FeedEvent } from "@/lib/live-feed.functions";

export function FeedSection() {
  const { address, onArc, network, connect, switchToArc } = useWallet();
  const activeNet = network ?? preferredNetwork();
  const [publishing, setPublishing] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function publishOnchain(eventId: string) {
    if (!address) {
      await connect();
      return;
    }
    if (!onArc) {
      await switchToArc();
      return;
    }
    setPublishing(eventId);
    setTxHash(null);
    try {
      const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!eth) throw new Error("No wallet");
      const data =
        "0x" +
        Array.from(new TextEncoder().encode(eventId))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const hash = (await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: address, value: "0x0", data }],
      })) as string;
      setTxHash(hash);
      rememberSessionTx(activeNet, address, {
        hash,
        from: address,
        to: address,
        valueWei: "0",
        timestamp: Math.floor(Date.now() / 1000),
        blockNumber: null,
        input: data,
      });
    } catch (e) {
      console.warn("publish failed", e);
    } finally {
      setPublishing(null);
    }
  }

  async function publishLiveEvent(e: FeedEvent) {
    return publishOnchain(e.sourceUrl);
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 md:py-24">
      <SectionHeader
        eyebrow="GLOBAL TERMINAL FEED"
        title="The signal layer behind every prediction market"
        desc="A real-time intelligence stream financializing Geopolitics, Rare Earth supply chains, Macroeconomics and Crypto liquidity. Every card carries an automatically scored stage, severity and confidence metric, mapping global volatility before you take an onchain position."
      />
      <div className="mt-12">
        <LiveNewsFeed onPublish={publishLiveEvent} publishingId={publishing} />
      </div>

      {txHash && (
        <div className="mt-6 rounded-xl border border-primary/40 bg-primary/5 p-4 font-mono text-sm">
          <div className="text-primary">✓ Signed onto {activeNet.chainName}</div>
          <a
            href={`${activeNet.explorer}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block break-all text-xs text-muted-foreground hover:text-foreground"
          >
            {txHash}
          </a>
        </div>
      )}
    </section>
  );
}