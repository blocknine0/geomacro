import { createFileRoute } from "@tanstack/react-router";
import { GlobalRiskWorkspace } from "@/components/gri/global-risk-workspace";

const TITLE = "Global Risk Index (GRI) · Geomacro";
const DESCRIPTION =
  "Inspect Geomacro's current verified Global Risk Index with history, exact change attribution, evidence quality, methodology and integrity fingerprints.";

export const Route = createFileRoute("/global-risk")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/global-risk" },
      { property: "og:image", content: "https://geomacro.live/og-signal-card-v2.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/global-risk" }],
  }),
  component: GlobalRiskWorkspace,
});
