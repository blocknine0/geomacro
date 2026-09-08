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
  "Geomacro research, Global Risk Index methodology, provenance, change attribution, validation boundaries and technical documentation for geopolitical and macro risk intelligence.";

const RESEARCH_AREAS = [
  {
    icon: Gauge,
    title: "Global Risk Index methodology",
    body: "Understand the current v1.2 scoring domains, recency weighting, source/story concentration controls, coverage treatment and versioning rules.",
    to: "/docs/gri-architecture" as const,
    cta: "Open GRI architecture",
  },
  {
    icon: Fingerprint,
    title: "Proof & reproducibility",
    body: "Inspect how a published GRI snapshot is tied to evidence, calculation inputs, contribution ledgers, methodology versions and integrity hashes.",
    to: "/global-risk" as const,
    cta: "Verify the current GRI",
  },
  {
    icon: GitBranch,
    title: "Change attribution",
    body: "See how score movement is reconciled to category and event-level contribution changes rather than explained by a narrative added after the fact.",
    to: "/docs/20-change-attribution" as const,
    cta: "Read attribution methodology",
  },
  {
    icon: ShieldCheck,
    title: "Source governance & reliability",
    body: "Review source eligibility, provenance, independence, contradiction handling, confidence and fail-closed design boundaries.",
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
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Understand how Geomacro reaches, explains and verifies a risk view.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          This is the public research hub for methodology, evidence quality, attribution and validation boundaries. It summarizes the key research layers and points to the deeper technical documentation rather than duplicating the full 52-page reference.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2"><Link to="/docs">Open documentation <ArrowRight className="h-4 w-4" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/global-risk">Verify current GRI</Link></Button>
        </div>
      </section>

      <section className="mt-14">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Core research areas</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">From evidence to an auditable risk result.</h2>
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
            Research starts from the same current event evidence users can inspect on the live intelligence surface.
          </p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/intelligence">Open intelligence <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <FileSearch className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">52-page technical reference</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Product architecture, source governance, GRI, Risk Objects, Risk Gate, coverage, determinism, commercial boundaries and technical proof are documented separately.
          </p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/docs/00-overview">Start from overview <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Commercial evidence boundary</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Research usefulness, commercial source rights, production security and customer validation are separate gates. Passing one does not imply the others.
          </p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/about">About & Trust <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Research standard</p>
            <h2 className="mt-3 text-2xl font-semibold">Separate evidence, interpretation and claims.</h2>
          </div>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p><span className="font-medium text-foreground">Observed evidence:</span> source material, timestamps and provenance should remain distinguishable from model-derived interpretation.</p>
            <p><span className="font-medium text-foreground">Model interpretation:</span> severity, confidence, classification and story-correlation decisions carry their own versioned provenance.</p>
            <p><span className="font-medium text-foreground">Deterministic aggregation:</span> the GRI numerical aggregation does not use an LLM call or discretionary manual adjustment after eligible inputs are fixed.</p>
            <p><span className="font-medium text-foreground">Validation boundaries:</span> correlation is not causation; no predictive, audit, certification or institutional-validation claim should be inferred unless the specific evidence supports it.</p>
          </div>
        </div>
      </section>

      <section className="mt-14 border-t border-border/60 pt-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Need the implementation details?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Use the documentation for exact methodology and system contracts, then inspect the current GRI proof surface.</p>
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
