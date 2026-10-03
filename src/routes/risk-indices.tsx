import { createFileRoute } from "@tanstack/react-router";
import { RiskIndicesWorkspace } from "@/components/risk-indices/risk-indices-workspace";

const TITLE = "Risk Indices | Geopolitical, Macro & Critical Minerals | Geomacro";
const DESCRIPTION =
  "Inspect Geomacro's separate verified Geopolitical Risk Index, Macroeconomic Risk Index and Critical Minerals Risk Index.";
const URL = "https://geomacro.live/risk-indices";
const IMAGE = "https://geomacro.live/og-signal-card-v2.png";

export const Route = createFileRoute("/risk-indices")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: RiskIndicesWorkspace,
});
