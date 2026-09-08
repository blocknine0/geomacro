import { createFileRoute } from "@tanstack/react-router";
import { ArenaSection } from "@/components/sections/arena-section";
import { TechnicalProofBanner } from "@/components/technical-proof-banner";

export const Route = createFileRoute("/arena")({
  head: () => ({
    meta: [
      { title: "Prediction Markets · Technical Proof · Geomacro" },
      {
        name: "description",
        content:
          "Secondary Arc Testnet application showing how Geomacro intelligence can connect to prediction-market and programmable-finance workflows.",
      },
      { property: "og:title", content: "Prediction Markets · Technical Proof · Geomacro" },
      {
        property: "og:description",
        content:
          "A secondary testnet application and feedback layer built on top of Geomacro risk intelligence.",
      },
      { property: "og:url", content: "https://geomacro.live/arena" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/arena" }],
  }),
  component: ArenaTechnicalProofPage,
});

function ArenaTechnicalProofPage() {
  return (
    <>
      <TechnicalProofBanner
        title="Prediction Markets"
        description="This Arc Testnet surface is a secondary application and feedback layer. It is preserved as technical proof and is not Geomacro's primary commercial identity."
      />
      <ArenaSection />
    </>
  );
}
