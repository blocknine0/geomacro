import { createFileRoute } from "@tanstack/react-router";
import { ArenaSection } from "@/components/sections/arena-section";
export const Route = createFileRoute("/arena")({
  head: () => ({
    meta: [
      { title: "Intelligence Panel · Geomacro" },
      { name: "description", content: "Event-driven prediction markets on Arc Testnet. Two AI analysts publish opposing macro briefings on every breaking story; take a position in USDC and the contract settles in 48 hours." },
      { property: "og:title", content: "Intelligence Panel · Geomacro" },
      { property: "og:description", content: "Event-driven prediction markets settled in USDC on Arc Testnet, priced by opposing AI analyst briefings." },
      { property: "og:url", content: "https://geomacro.live/arena" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/arena" }],
  }),
  component: ArenaSection,
});
