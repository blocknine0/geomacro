import { createFileRoute } from "@tanstack/react-router";
import { EditorialPage } from "@/components/editorial-page";
const TITLE = "Institutional Risk Intelligence | Geomacro";
const DESCRIPTION =
  "Commercial geopolitical, macroeconomic and critical-minerals risk intelligence for treasury, strategy, supply-chain and research teams.";
export const Route = createFileRoute("/institutional")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/institutional" },
      { property: "og:image", content: "https://geomacro.live/og-signal-card-v2.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/institutional" }],
  }),
  component: InstitutionalPage,
});

function InstitutionalPage() {
  return (
    <EditorialPage
      eyebrow={"For teams"}
      title={"A clearer view before the next decision."}
      intro={"Follow the external changes that affect your countries, operations and suppliers."}
      items={[
        {
          title: "Risk & strategy",
          text: "Review policy, conflict and sanctions developments with their practical implications.",
          href: "/intelligence",
          label: "Explore intelligence",
        },
        {
          title: "Treasury",
          text: "Follow rates, inflation and currency developments in the countries you operate in.",
          href: "/intelligence?category=macro",
          label: "Explore Macro / FX",
        },
        {
          title: "Supply chain",
          text: "Track critical-mineral developments, sourcing dependencies and export pressure.",
          href: "/intelligence?category=rare_earth",
          label: "Explore Critical Minerals",
        },
        {
          title: "Applications & agents",
          text: "Discuss structured delivery for a defined country, corridor or monitoring workflow.",
          href: "/data-api",
          label: "API & Agents",
        },
      ]}
      note={
        "Commercial scope, volume and delivery terms are agreed before activation. Contact contact@geomacro.live with your workflow."
      }
    ><details className="mt-8 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">Pilot delivery scope</summary><p className="mt-3 text-sm leading-7 text-muted-foreground">Signed Risk Objects and Risk Gate remain controlled pilot products. Risk Gate, paid agent/x402 production access and broader machine delivery remain roadmap or controlled capabilities until separately promoted. Scope, service terms and access are agreed before commercial delivery.</p></details></EditorialPage>
  );
}
