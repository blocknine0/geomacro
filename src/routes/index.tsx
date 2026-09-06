import { createFileRoute } from "@tanstack/react-router";
import { HeroSection } from "@/components/sections/hero-section";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Geomacro: Geopolitical + Macro Risk Intelligence" },
      { name: "description", content: "Geomacro turns global geopolitical and macro events into structured, explainable risk intelligence for professional and machine decision-making." },
      { property: "og:title", content: "Geomacro: Geopolitical + Macro Risk Intelligence" },
      { property: "og:description", content: "Structured, explainable geopolitical and macro risk intelligence with evidence, confidence and change attribution." },
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
            "Structured geopolitical and macro risk intelligence for research, professional decision systems and machine workflows.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: HeroSection,
});