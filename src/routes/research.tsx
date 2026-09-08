import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  FileSearch,
  Fingerprint,
  Gauge,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TITLE = "Research & Methodology · Geomacro";
const DESCRIPTION =
  "Geomacro research, Global Risk Index methodology, provenance, change attribution, validation limits and technical documentation for geopolitical and macro risk intelligence.";

const RESEARCH_AREAS = [
  {
    icon: Gauge,
    title: "Global Risk Index methodology",
    body: "See the current v1.2 scoring domains, recency weighting, source and story concentration controls, coverage treatment and versioning rules.",
    to: "/docs/gri-architecture" as const,
    cta: "Open GRI architecture",
  },
  {
    icon: Fingerprint,
    title: "Proof & reproducibility",
    body: "Trace a published GRI snapshot back to its evidence, calculation inputs, contribution ledger, methodology version and integrity hashes.",
    to: "/global-risk" as const,
    cta: "Verify the current GRI",
  },
  {
    icon: GitBranch,
    title: "Change attribution",
    body: "See which category and event-level contributions actually changed when the score moved, rather than relying on an explanation written afterwards.",
    to: "/docs/20-change-attribution" as const,
    cta: "Read attribution methodology",
  },
  {
    icon: ShieldCheck,
    title: "Source governance & reliability",
    body: "Review source eligibility, provenance, independence, contradiction handling, confidence and the rules that make the system fail closed.",
    to: "/docs/09-source-governance" as const,
    cta: "Read source governance",
  },
] as const;

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
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">See how the risk score is built, changed and checked.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          This page brings together the public methodology, evidence rules, change attribution and validation limits. The full technical detail remains in the documentation.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2"><Link to="/docs">Open documentation <ArrowRight className="h-4 w-4" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/global-risk">Verify current GRI</Link></Button>
        </div>
      </section>

      <section className="mt-14">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Core research areas</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">From evidence to a score you can trace.</h2>
        </div>
        <div className="mt-7 grid gap-5 md:grid-cols-2">
          {RESEARCH_AREAS.map(({ icon: Icon, title, body, to, cta }) => (
            <article key={title} className="rounded-2xl border border-border/70 bg-card/50 p-6">
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
              <Button asChild variant="link" className="mt-4 h-auto p-0"><Link to={to}>{cta} <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-3">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Live intelligence</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The research starts from the same current event evidence that anyone can inspect on the live intelligence page.
          </p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/intelligence">Open intelligence <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <FileSearch className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">52-page technical reference</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The documentation covers product architecture, source governance, GRI, Risk Objects, Risk Gate, determinism, commercial boundaries and technical proof in detail.
          </p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/docs/00-overview">Start from overview <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">What research evidence does not prove</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Useful research does not automatically prove commercial source rights, production security or customer demand. Those are separate checks.
          </p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/about">About & Trust <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Research standard</p>
            <h2 className="mt-3 text-2xl font-semibold">Keep evidence, interpretation and claims separate.</h2>
          </div>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p><span className="font-medium text-foreground">Observed evidence:</span> source material, timestamps and provenance stay distinguishable from model-derived interpretation.</p>
            <p><span className="font-medium text-foreground">Model interpretation:</span> severity, confidence, classification and story-correlation decisions carry their own versioned provenance.</p>
            <p><span className="font-medium text-foreground">Deterministic aggregation:</span> once eligible inputs are fixed, the GRI numerical aggregation does not use an LLM call or discretionary manual adjustment.</p>
            <p><span className="font-medium text-foreground">Validation limits:</span> correlation is not causation. Predictive, audit, certification or institutional-validation claims are made only when the specific evidence supports them.</p>
          </div>
        </div>
      </section>

      <section className="mt-14 border-t border-border/60 pt-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Need the exact calculation and proof fields?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Use the technical documentation, then inspect the current verified GRI snapshot.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button asChild><Link to="/docs">Documentation</Link></Button>
            <Button asChild variant="outline"><Link to="/docs/gri-architecture">GRI architecture</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}
