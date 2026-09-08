import { createFileRoute } from "@tanstack/react-router";
import { LiquiditySection } from "@/components/sections/liquidity-section";
import { TechnicalProofBanner } from "@/components/technical-proof-banner";

export const Route = createFileRoute("/bridge-swap")({
  head: () => ({
    meta: [
      { title: "Bridge & Swap · Circle / Arc Technical Proof · Geomacro" },
      {
        name: "description",
        content:
          "Secondary Circle and Arc Testnet implementation showing USDC bridge and supported swap flows alongside the Geomacro intelligence product.",
      },
      { property: "og:title", content: "Bridge & Swap · Circle / Arc Technical Proof · Geomacro" },
      {
        property: "og:description",
        content:
          "Circle CCTP and Arc Testnet bridge/swap implementation preserved as secondary technical proof for Geomacro.",
      },
      { property: "og:url", content: "https://geomacro.live/bridge-swap" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/bridge-swap" }],
  }),
  component: BridgeSwapTechnicalProofPage,
});

function BridgeSwapTechnicalProofPage() {
  return (
    <>
      <TechnicalProofBanner
        title="Circle / Arc Bridge & Swap"
        description="This Testnet implementation demonstrates Circle and Arc integration. It is technical proof and not the primary Geomacro commercial product."
      />
      <LiquiditySection />
    </>
  );
}
