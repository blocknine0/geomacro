import { createFileRoute } from "@tanstack/react-router";
import { OnchainSection } from "@/components/sections/onchain-section";

export const Route = createFileRoute("/onchain")({
  head: () => ({
    meta: [
      { title: "Onchain · Geomacro" },
      { name: "description", content: "Arc Testnet and mainnet network info, faucet links and wallet activity for the Geomacro oracle." },
      { property: "og:title", content: "Onchain · Geomacro" },
      { property: "og:description", content: "Arc network details and wallet activity for Geomacro." },
      { property: "og:url", content: "https://geomacrooracle.lovable.app/onchain" },
    ],
    links: [{ rel: "canonical", href: "https://geomacrooracle.lovable.app/onchain" }],
  }),
  component: OnchainSection,
});