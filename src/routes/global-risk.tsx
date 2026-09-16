import { createFileRoute } from "@tanstack/react-router";
import { RiskIndicesWorkspace } from "@/components/risk-indices/risk-indices-workspace";

const TITLE = "Risk Indices | Geopolitical, Macro & Critical Minerals | Geomacro";
const DESCRIPTION =
  "Inspect Geomacro's separate verified Geopolitical Risk Index, Macroeconomic Risk Index and Critical Minerals Risk Index with history and integrity proof.";
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
      { property: "og:image:alt", content: "Geomacro geopolitical, macroeconomic and critical-minerals risk indices" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE },
      { name: "twitter:image:alt", content: "Geomacro geopolitical, macroeconomic and critical-minerals risk indices" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Geomacro Risk Indices",
          url: URL,
          description: DESCRIPTION,
          inLanguage: "en",
          isPartOf: { "@id": "https://geomacro.live/#website" },
          about: [
            { "@type": "Thing", name: "Geopolitical risk" },
            { "@type": "Thing", name: "Macroeconomic risk" },
            { "@type": "Thing", name: "Critical minerals risk" },
          ],
          publisher: { "@id": "https://geomacro.live/#organization" },
        }),
      },
    ],
  }),
  component: RiskIndicesWorkspace,
});
