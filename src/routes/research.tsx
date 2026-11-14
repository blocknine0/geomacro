import { createFileRoute } from "@tanstack/react-router";
import { EditorialPage } from "@/components/editorial-page";
const TITLE = "Research & Evidence Methodology · Geomacro";
const DESCRIPTION =
  "Geomacro research methodology for geopolitical, macroeconomic and critical-mineral intelligence, evidence governance, change attribution and validation limits.";
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
      title={"How evidence becomes intelligence."}
      intro={"Methodology, evidence rules and change attribution in one place."}
      items={[
        {
          title: "Methodology",
          text: "Understand source eligibility, independent corroboration and qualified data.",
          href: "/docs/09-source-governance",
          label: "Read methodology",
        },
        {
          title: "Proof & reproducibility",
          text: "Inspect native dates and what evidence has been verified.",
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
        "Evidence methodology does not establish predictive accuracy or external certification. Unavailable and unverified information is identified explicitly."
      }
    />
  );
}
