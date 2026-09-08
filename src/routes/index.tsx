import { createFileRoute } from "@tanstack/react-router";
import { CommercialHome } from "@/components/home/commercial-home";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Geomacro: Geopolitical + Macro Risk Intelligence" },
      {
        name: "description",
        content:
          "Geomacro turns global geopolitical and macro events into explainable risk scores, evidence, confidence and machine-readable decision context for professional and automated workflows.",
      },
      { property: "og:title", content: "Geomacro: Geopolitical + Macro Risk Intelligence" },
      {
        property: "og:description",
        content:
          "Explainable geopolitical and macro risk intelligence with a live Global Risk Index, Risk Gate Private Pilot and machine-readable decision context.",
      },
      { property: "og:url", content: "https://geomacro.live/" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Geomacro",
          url: "https://geomacro.live/",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description:
            "Explainable geopolitical and macro risk intelligence for human and machine decisions.",
        }),
      },
    ],
  }),
  component: CommercialHome,
});
