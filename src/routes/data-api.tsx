import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Braces, Bot, Globe2 } from "lucide-react";
import { AgentCommerceStatus } from "@/components/agent-commerce-status";
import { CategoryApiLaunchPanel } from "@/components/category-api-launch-panel";
import { ApiKeysNotice } from "@/components/api-keys-notice";
import { CapabilityPriceSchedule } from "@/components/capability-price-schedule";
const TITLE = "API & Agents | Geomacro";
const DESCRIPTION =
  "Structured geopolitical, Macro/FX and critical-minerals intelligence for applications and AI agents. API keys coming soon.";
const URL = "https://geomacro.live/data-api";
export const Route = createFileRoute("/data-api")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: DataApiPage,
});

function DataApiPage() {
  return (
    <main className="gm-container py-12 sm:py-16">
      <header className="max-w-3xl">
        <p className="gm-eyebrow">API & Agents</p>
        <h1 className="gm-page-title">Bring global context into your workflow.</h1>
        <p className="gm-intro">
          Structured answers across Geopolitics, Macro / FX and Critical Minerals.
        </p>
      </header>
      <div className="mt-8">
        <ApiKeysNotice />
      </div>
      <div className="my-10 grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Braces,
            title: "Structured output",
            body: "Clear fields for what changed, why it matters and the evidence limits.",
          },
          {
            icon: Globe2,
            title: "Countries & corridors",
            body: "Request a country, topic or directional corridor.",
          },
          {
            icon: Bot,
            title: "For your agent",
            body: "One intelligence engine for application and agent requests.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <article key={title} className="rounded-xl border border-border p-6">
            <Icon className="h-5 w-5 text-primary" />
            <h2 className="mt-5 font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap gap-6 border-y border-border py-5">
        <Link to="/pricing" className="gm-text-link">
          Open Store <ArrowRight className="h-4 w-4" />
        </Link>
        <Link to="/docs" className="gm-text-link">
          Read documentation <ArrowRight className="h-4 w-4" />
        </Link>
        <a href="/api/v1/agent?view=openapi" className="gm-text-link">
          API schema ↗
        </a>
      </div>
      <details className="mt-8"><summary className="cursor-pointer text-sm font-medium">Delivery status & product boundaries</summary><div className="mt-4"><AgentCommerceStatus /></div><div className="mt-4 space-y-3 text-xs leading-6 text-muted-foreground"><p>Paid API requests become available only when the live payment and delivery service confirms activation.</p><p>Free Explorer is website/dashboard access, not a free API.</p><p>Payment never bypasses evidence, freshness, source-rights or product controls.</p><p>Get concise, structured Geomacro intelligence built for decisions, while underlying evidence remains protected.</p><p>Corridor model: ENDPOINT_COMPOSED_V0_1. route_modeling_status = NOT_MODELED. Risk Gate: execution_authorized=false.</p></div></details>
    <details className="mt-8"><summary className="cursor-pointer text-sm font-medium">Try the request console</summary><CategoryApiLaunchPanel /></details>
    <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium">
          Browse exact product prices
        </summary>
        <div className="mt-6">
          <CapabilityPriceSchedule compact />
        </div>
      </details>
      <p className="mt-8 text-xs text-muted-foreground">
        API and AI-agent marketplace listings are planned after launch.
      </p>
    </main>
  );
}
