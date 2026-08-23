import { createFileRoute } from "@tanstack/react-router";
import { LiquiditySection } from "@/components/sections/liquidity-section";

export const Route = createFileRoute("/bridge")({
  head: () => ({
    meta: [
      { title: "Bridge USDC to Arc · Geomacro" },
      {
        name: "description",
        content:
          "Bridge native USDC from supported Circle CCTP testnets to Arc Testnet.",
      },
      { property: "og:title", content: "Bridge USDC to Arc · Geomacro" },
      {
        property: "og:description",
        content:
          "Bridge native USDC from supported Circle CCTP testnets to Arc Testnet.",
      },
    ],
  }),
  component: LiquiditySection,
});
