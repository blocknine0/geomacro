import { createFileRoute } from "@tanstack/react-router";
import { LiquiditySection } from "@/components/sections/liquidity-section";

export const Route = createFileRoute("/bridge-swap")({
  head: () => ({
    meta: [
      { title: "Bridge & Swap on Arc · Geomacro" },
      {
        name: "description",
        content:
          "Secondary execution layer for Geomacro. Bridge native USDC with Circle CCTP and swap supported assets on Arc Testnet.",
      },
      {
        property: "og:title",
        content: "Bridge & Swap on Arc · Geomacro",
      },
      {
        property: "og:description",
        content:
          "Secondary execution layer using USDC, Circle CCTP and programmable asset execution on Arc Testnet.",
      },
    ],
  }),
  component: LiquiditySection,
});
