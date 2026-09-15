import { createFileRoute } from "@tanstack/react-router";
import { CommercialHome } from "@/components/home/commercial-home";

const TITLE = "Geopolitical & Macro Risk Intelligence | Geomacro";
const DESCRIPTION =
  "Geomacro turns geopolitical and macro developments into explainable risk scores, evidence, confidence, change attribution and machine-readable decision context.";
const URL = "https://geomacro.live/";
const IMAGE = "https://geomacro.live/og-image-v2.png";

export const Route = createFileRoute("/")({
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
      { property: "og:image:alt", content: "Geomacro geopolitical and macro risk intelligence" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE },
      { name: "twitter:image:alt", content: "Geomacro geopolitical and macro risk intelligence" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "@id": "https://geomacro.live/#application",
          name: "Geomacro",
          url: URL,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          inLanguage: "en",
          publisher: { "@id": "https://geomacro.live/#organization" },
          description: DESCRIPTION,
        }),
      },
    ],
  }),
  component: CommercialHome,
});
