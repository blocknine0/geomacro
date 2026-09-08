import { createFileRoute } from "@tanstack/react-router";
import { OnchainSection } from "@/components/sections/onchain-section";
import { TechnicalProofBanner } from "@/components/technical-proof-banner";

export const Route = createFileRoute("/onchain")({
  head: () => ({
    meta: [
      { title: "Arc / Onchain · Technical Proof · Geomacro" },
      {
        name: "description",
        content:
          "Secondary Arc network and programmable-finance technical proof for Geomacro, separate from the primary risk-intelligence product.",
      },
      { property: "og:title", content: "Arc / Onchain · Technical Proof · Geomacro" },
      {
        property: "og:description",
        content:
          "Arc network, wallet and programmable-finance implementation used as secondary technical proof for Geomacro.",
      },
      { property: "og:url", content: "https://geomacro.live/onchain" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/onchain" }],
  }),
  component: OnchainTechnicalProofPage,
});

function OnchainTechnicalProofPage() {
  return (
    <>
      <TechnicalProofBanner
        title="Arc / Onchain"
        description="This surface demonstrates Geomacro's programmable-finance implementation on Arc. It is a secondary technical-proof layer rather than the core intelligence product."
      />
      <OnchainSection />
    </>
  );
}
