import { createFileRoute } from "@tanstack/react-router";
import { EditorialPage } from "@/components/editorial-page";
const TITLE = "Ecosystem & Partnerships · Geomacro";
const DESCRIPTION =
  "Geomacro's ecosystem, Circle Alliance membership, technical integrations and partnership model for bringing explainable external-risk intelligence into institutional and AI workflows.";
const URL = "https://geomacro.live/ecosystem";
export const Route = createFileRoute("/ecosystem")({
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
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: EcosystemPage,
});

function EcosystemPage() {
  return (
    <EditorialPage
      eyebrow={"Ecosystem"}
      title={"Build with Geomacro."}
      intro={"Bring structured global context into research, software and agent workflows."}
      items={[
        {
          title: "Builders",
          text: "Explore the API contract and product catalog before planning an integration.",
          href: "/data-api",
          label: "Explore the API",
        },
        {
          title: "Research & evaluation",
          text: "Review methodology and limitations against the decisions you need to support.",
          href: "/research",
          label: "Explore research",
        },
        {
          title: "Distribution",
          text: "Discuss a specific integration, audience or distribution partnership.",
          href: "/contact",
          label: "Start a conversation",
        },
        {
          title: "Marketplaces",
          text: "API and AI-agent listings are planned after launch. Availability will be stated here once verified.",
          href: "/pricing",
          label: "Explore the catalog",
        },
      ]}
      note={
        "A protocol or integration reference does not imply an official partnership or a live marketplace listing."
      }
    ><details className="mt-8 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">Circle Alliance directory</summary><a href="https://partners.circle.com/partner/geomacro" className="gm-text-link mt-3" rel="noreferrer" target="_blank">View Geomacro’s directory entry ↗</a><p className="mt-3 text-xs leading-6 text-muted-foreground">It does not mean Circle endorses Geomacro, its risk methodology or customer decisions.</p></details></EditorialPage>
  );
}
