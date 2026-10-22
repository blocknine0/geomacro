import { createFileRoute } from "@tanstack/react-router";
import { EditorialPage } from "@/components/editorial-page";
const TITLE = "About, Trust & Product Boundaries · Geomacro";
const DESCRIPTION =
  "How Geomacro builds geopolitical and macro risk intelligence, what is live today, what remains Private Pilot, and the privacy, security and product-use boundaries that apply.";
const URL = "https://geomacro.live/about";
export const Route = createFileRoute("/about")({
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
  component: AboutPage,
});

function AboutPage() {
  return (
    <EditorialPage
      eyebrow={"About & Trust"}
      title={"Understand the world. Inspect the context."}
      intro={
        "Geomacro turns global developments into structured intelligence for people, applications and agents."
      }
      items={[
        {
          title: "Three domains",
          text: "Geopolitics, Macro / FX and Critical Minerals. Each keeps its own context and coverage.",
          href: "/intelligence",
          label: "Read findings",
        },
        {
          title: "Dates stay visible",
          text: "Original publication dates, confidence and limitations help you judge what a result can support.",
          href: "/research",
          label: "Inspect the methodology",
        },
        {
          title: "Derived intelligence",
          text: "We deliver our structured interpretation. Raw articles, source feeds and private retrieval records are not sold.",
          href: "/docs",
          label: "Read product documentation",
        },
        {
          title: "Your decision",
          text: "Geomacro supplies context. You control policy, permissions, money and any downstream action.",
          href: "/contact",
          label: "Contact us",
        },
      ]}
      note={
        "Public findings have a 15-minute delay; Risk Indices have a 60-minute delay. Missing evidence is not a zero-risk reading. API keys and self-service checkout are coming soon. We do not sell personal information. Privacy or data-removal enquiries: contact@geomacro.live."
      }
    >
      <details id="privacy" className="mt-8 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">Privacy</summary><p className="mt-3 text-sm leading-7 text-muted-foreground">Category preferences, visit time and saved finding identifiers stay in your browser. We do not store story text in reader preferences. Email contact@geomacro.live for privacy or removal enquiries. No independent external security certification or production SLA is claimed unless actually completed or contracted.</p></details>
      <details id="product-use" className="mt-4 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">Product use</summary><p className="mt-3 text-sm leading-7 text-muted-foreground">Risk Gate remains non-authorizing. The customer remains responsible for any decision or action. Geomacro provides information and context, not financial, legal or investment advice. Missing or stale evidence stays labeled.</p></details>
    </EditorialPage>
  );
}
