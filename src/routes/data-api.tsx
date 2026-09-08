import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Braces, Database, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Data & API · Geomacro";
const DESCRIPTION =
  "Structured geopolitical and macro risk data, signed Risk Objects and Private Pilot API access for professional and machine workflows.";

export const Route = createFileRoute("/data-api")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: "https://geomacro.live/data-api" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/data-api" }],
  }),
  component: DataApiPage,
});

function DataApiPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-4xl">
        <Badge variant="outline" className="font-mono text-[11px]">PUBLIC + PRIVATE PILOT</Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Risk intelligence as structured data.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Use Geomacro through public intelligence surfaces today, or work with the Private Pilot for machine-readable Risk Objects, Risk Gate integration and institutional workflows.
        </p>
      </section>

      <section className="mt-12 grid gap-5 md:grid-cols-3">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Public intelligence</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Live events, Global Risk Index, evidence, confidence and selected methodology surfaces remain available as the public discovery layer.</p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <Braces className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Risk API</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Private Pilot delivery for structured country and corridor risk context, signed Geomacro Risk Objects and policy-ready machine outputs.</p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Auditability</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Methodology versions, timestamps, source evidence, confidence and cryptographic verification are designed to make risk outputs inspectable rather than opaque.</p>
        </article>
      </section>

      <section className="mt-12 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Access model</p>
            <h2 className="mt-3 text-2xl font-semibold">From public research to institutional delivery</h2>
          </div>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div><span className="font-medium text-foreground">Public:</span> live intelligence and core GRI transparency.</div>
            <div><span className="font-medium text-foreground">Professional direction:</span> deeper history, alerts, exports and advanced research workflows as they become available.</div>
            <div><span className="font-medium text-foreground">Institutional Private Pilot:</span> Risk API, Risk Gate, monitoring and integration support under scoped pilot terms.</div>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="gap-2"><Link to="/contact">Request access <ArrowRight className="h-4 w-4" /></Link></Button>
          <Button asChild variant="outline"><Link to="/docs">Read documentation</Link></Button>
        </div>
      </section>
    </main>
  );
}
