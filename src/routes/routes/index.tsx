import { createFileRoute } from "@tanstack/react-router";
import { HeroSection } from "@/components/sections/hero-section";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Geomacro: Onchain Geopolitical Risk on Arc" },
      { name: "description", content: "AI-classified geopolitical events published onchain to the Arc testnet. Connect a wallet to verify, subscribe and act." },
      { property: "og:title", content: "Geomacro: Onchain Geopolitical Risk on Arc" },
      { property: "og:description", content: "AI-classified geopolitical events published onchain to the Arc testnet." },
      { property: "og:url", content: "https://geomacro.live/" },
    ],
    links: [
      { rel: "canonical", href: "https://geomacro.live/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Geomacro",
          url: "https://geomacro.live/",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          description:
            "AI-classified geopolitical and macro events published onchain to the Arc network.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: HeroSection,
});