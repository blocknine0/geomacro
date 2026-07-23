import { createFileRoute } from "@tanstack/react-router";
import { BridgeSection } from "@/components/sections/bridge-section";

export const Route = createFileRoute("/bridge")({
  head: () => ({
    meta: [
      { title: "Bridge USDC to Arc · Geomacro" },
      {
        name: "description",
        content:
          "Bridge native USDC from Ethereum Sepolia, Avalanche Fuji, Base Sepolia, or Solana Devnet to Arc Testnet via Circle's CCTP.",
      },
      { property: "og:title", content: "Bridge USDC to Arc · Geomacro" },
      {
        property: "og:description",
        content:
          "Bridge native USDC from Ethereum Sepolia, Avalanche Fuji, Base Sepolia, or Solana Devnet to Arc Testnet via Circle's CCTP.",
      },
    ],
  }),
  component: BridgeSection,
});
