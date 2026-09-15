import { createFileRoute } from "@tanstack/react-router";
import { AskGeomacroSection } from "@/components/home/ask-geomacro";

const TITLE = "Ask Geomacro | Grounded Geopolitical Risk Research";
const DESCRIPTION =
  "Ask geopolitical and macro risk questions grounded in Geomacro's stored evidence and current verified Global Risk Index, with explicit evidence boundaries.";
const URL = "https://geomacro.live/ask-geomacro";
const IMAGE = "https://geomacro.live/og-signal-card-v2.png";

export const Route = createFileRoute("/ask-geomacro")({
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
      { property: "og:image:alt", content: "Ask Geomacro grounded geopolitical and macro risk intelligence" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE },
      { name: "twitter:image:alt", content: "Ask Geomacro grounded geopolitical and macro risk intelligence" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Ask Geomacro",
          url: URL,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          inLanguage: "en",
          description: DESCRIPTION,
          publisher: { "@id": "https://geomacro.live/#organization" },
          isPartOf: { "@id": "https://geomacro.live/#website" },
        }),
      },
    ],
  }),
  component: AskPage,
});

function AskPage() {
  return (
    <main>
      <AskGeomacroSection standalone />
    </main>
  );
}
