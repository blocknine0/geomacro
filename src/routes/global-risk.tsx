import { createFileRoute } from "@tanstack/react-router";
import { GlobalRiskWorkspace } from "@/components/gri/global-risk-workspace";

const TITLE = "Global Risk Index (GRI) | Geopolitical Risk | Geomacro";
const DESCRIPTION =
  "Inspect Geomacro's verified Global Risk Index with history, exact change attribution, evidence quality, methodology, coverage and integrity fingerprints.";
const URL = "https://geomacro.live/global-risk";
const IMAGE = "https://geomacro.live/og-signal-card-v2.png";

export const Route = createFileRoute("/global-risk")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: IMAGE },
      { property: "og:image:secure_url", content: IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Geomacro Global Risk Index and risk intelligence" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE },
      { name: "twitter:image:alt", content: "Geomacro Global Risk Index and risk intelligence" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Geomacro Global Risk Index",
          url: URL,
          description: DESCRIPTION,
          inLanguage: "en",
          isPartOf: { "@id": "https://geomacro.live/#website" },
          about: {
            "@type": "Thing",
            name: "Global geopolitical and macro risk intelligence",
          },
          publisher: { "@id": "https://geomacro.live/#organization" },
        }),
      },
    ],
  }),
  component: GlobalRiskWorkspace,
});
