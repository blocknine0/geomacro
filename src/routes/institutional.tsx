import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Landmark, Route as RouteIcon, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "For Institutions · Geomacro";
const DESCRIPTION =
  "Explainable geopolitical and macro risk intelligence for financial institutions, treasury teams, payments, supply chains and machine workflows.";

const USE_CASES = [
  {
    icon: Landmark,
    title: "Treasury and payments",
    body: "Evaluate country and corridor risk before releasing a cross-border payment or changing treasury limits.",
  },
  {
    icon: Building2,
    title: "Risk and strategy teams",
    body: "Track live risk, historical context, evidence and mathematically attributable changes instead of relying on an unexplained headline score.",
  },
  {
    icon: RouteIcon,
    title: "Supply chain and commodities",
    body: "Monitor countries, strategic resources and geopolitical disruptions that can affect sourcing, logistics and exposure decisions.",
  },
  {
    icon: Workflow,
    title: "AI and agent platforms",
    body: "Give automated financial workflows structured external risk context before a programmable action proceeds.",
  },
] as const;

export const Route = createFileRoute("/institutional")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: "https://geomacro.live/institutional" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/institutional" }],
  }),
  component: InstitutionalPage,
});

function InstitutionalPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-4xl">
        <Badge variant="outline" className="font-mono text-[11px]">INSTITUTIONAL EARLY ACCESS</Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Explainable risk intelligence for operational decisions.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Geomacro is building professional geopolitical and macro risk intelligence for teams that need evidence, confidence, attribution and machine-readable context, not another opaque score.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2"><Link to="/contact">Discuss a pilot <ArrowRight className="h-4 w-4" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/risk-gate">See Risk Gate</Link></Button>
        </div>
      </section>

      <section className="mt-14 grid gap-5 md:grid-cols-2">
        {USE_CASES.map(({ icon: Icon, title, body }) => (
          <article key={title} className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <Icon className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Why Geomacro</p>
            <h2 className="mt-3 text-2xl font-semibold">Trace the decision back to evidence.</h2>
          </div>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li><span className="font-medium text-foreground">Explainability:</span> score, change attribution, drivers and evidence are kept inspectable.</li>
            <li><span className="font-medium text-foreground">Machine readability:</span> structured Risk Objects and Private Pilot API delivery are designed for software as well as analysts.</li>
            <li><span className="font-medium text-foreground">Audit context:</span> methodology versions, timestamps, confidence and cryptographic proof support technical review.</li>
            <li><span className="font-medium text-foreground">Clear boundaries:</span> Private Pilot, testnet and technical-proof capabilities are labelled separately from generally available product claims.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
