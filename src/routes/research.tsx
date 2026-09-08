import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, FileSearch, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";

const TITLE = "Research & Methodology · Geomacro";
const DESCRIPTION =
  "Geomacro research, methodology, Global Risk Index transparency and technical documentation for geopolitical and macro risk intelligence.";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: "https://geomacro.live/research" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/research" }],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-4xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Research & methodology</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Understand how Geomacro reaches a risk view.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Geomacro publishes methodology, attribution and technical evidence so analysts, customers and developers can inspect how a risk output was produced and where its limitations remain.
        </p>
      </section>

      <section className="mt-14 grid gap-5 md:grid-cols-3">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <Gauge className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Global Risk Index</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Inspect the current global risk reading, historical movement, drivers, evidence coverage and published proof.</p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/global-risk">Open GRI <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <FileSearch className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Methodology & auditability</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Read the scoring, provenance, change-attribution and verification architecture behind published intelligence.</p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/docs">Read docs <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Live intelligence</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Follow current geopolitical and macro developments and open the underlying event intelligence for context.</p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/intelligence">Open intelligence <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Research standard</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Public research should distinguish observed evidence, model-derived interpretation and product limitations. Geomacro does not present an index score as certainty, and it does not imply independent validation or external audit until those checks have actually been completed.
        </p>
      </section>
    </main>
  );
}
