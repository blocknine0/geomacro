import { createFileRoute } from "@tanstack/react-router";
import { RoadmapSection } from "@/components/sections/roadmap-section";

const TITLE = "Geomacro Roadmap | Risk Intelligence Commercial Readiness";
const DESCRIPTION =
  "See Geomacro's shipped risk-intelligence milestones and current development priorities across separate Risk Indices, Risk Gate, governed data, APIs, security and institutional readiness.";
const URL = "https://geomacro.live/roadmap";
const IMAGE = "https://geomacro.live/og-image-v2.png";

export const Route = createFileRoute("/roadmap")({
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
      { property: "og:image:alt", content: "Geomacro risk intelligence commercial-readiness roadmap" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE },
      { name: "twitter:image:alt", content: "Geomacro risk intelligence commercial-readiness roadmap" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: TITLE,
          url: URL,
          description: DESCRIPTION,
          inLanguage: "en",
          isPartOf: { "@id": "https://geomacro.live/#website" },
          publisher: { "@id": "https://geomacro.live/#organization" },
        }),
      },
    ],
  }),
  component: RoadmapSection,
});
