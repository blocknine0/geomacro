import { createFileRoute } from "@tanstack/react-router";
import { EditorialPage } from "@/components/editorial-page";
const TITLE = "Research & Evidence Methodology · Geomacro";
const DESCRIPTION =
  "Geomacro research and methodology for geopolitical, macroeconomic and critical-mineral intelligence, evidence governance, change attribution and validation limits.";
export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/research" },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/research" }],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  return (
    <EditorialPage
      eyebrow={"Research & evidence"}
      title={"See how a risk reading is built."}
      intro={"Methodology, evidence rules and change attribution in one place."}
      items={[
        {
          title: "Methodology",
          text: "Understand GRI v1.2 and how the three domain indices are derived.",
          href: "/docs/gri-architecture",
          label: "Read methodology",
        },
        {
          title: "Proof & reproducibility",
          text: "Inspect dated intelligence findings and the scope of their verification.",
          href: "/intelligence",
          label: "Read intelligence",
        },
        {
          title: "What moved the reading",
          text: "Trace changes through event and domain contributions.",
          href: "/docs/20-change-attribution",
          label: "Read change attribution",
        },
        {
          title: "Evidence standards",
          text: "Review source eligibility, independence and confidence requirements.",
          href: "/docs/09-source-governance",
          label: "Read evidence rules",
        },
      ]}
      note={
        "Methodology and integrity proofs do not establish predictive accuracy or external certification. Current signed readings may be unavailable; the product shows that state explicitly."
      }
    />
  );
}
