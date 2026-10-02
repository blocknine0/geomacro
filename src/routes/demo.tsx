import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { AgentCommerceStatus } from "@/components/agent-commerce-status";
import { Button } from "@/components/ui/button";

const TITLE = "Agentic Commerce & Machine Access | Geomacro";
const DESCRIPTION =
  "Inspect Geomacro's runtime-controlled machine-access boundary, Risk Gate decision context and agent-oriented commercial delivery model.";
const URL = "https://geomacro.live/demo";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: AgenticCommercePage,
});

function AgenticCommercePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <section className="max-w-4xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          <ShieldCheck className="h-3.5 w-3.5" /> Runtime-controlled machine access
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Risk context before an agent takes a consequential action.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
          Geomacro exposes governed geopolitical, macroeconomic and critical-mineral intelligence to software and AI agents through bounded product contracts. Risk Gate remains advisory and non-authorizing; customer policy and final execution remain outside Geomacro.
        </p>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-border/70 bg-card/40 p-6">
          <AgentCommerceStatus />
          <p className="mt-5 text-sm leading-7 text-muted-foreground">
            Payment and access availability is read from the live service contract. Static website copy never activates a settlement rail or widens a machine entitlement.
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/40 p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Machine decision boundary</p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <p>1. A caller requests a bounded country or corridor risk product.</p>
            <p>2. Geomacro checks deliverability, evidence freshness, entitlement and product policy.</p>
            <p>3. Risk Gate returns structured context and a recommendation with <span className="font-mono text-foreground">execution_authorized=false</span>.</p>
            <p>4. The caller applies its own identity, permissions, compliance and execution policy.</p>
          </div>
        </div>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild><Link to="/risk-gate">Open Risk Gate <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        <Button asChild variant="outline"><Link to="/data-api">API & Agents</Link></Button>
        <Button asChild variant="outline"><Link to="/docs">Documentation</Link></Button>
      </div>
    </main>
  );
}
