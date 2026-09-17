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

const TITLE = "Research, Risk Indices & Methodology · Geomacro";
const DESCRIPTION =
  "Geomacro research and methodology for separate geopolitical, macroeconomic and critical-mineral Risk Indices, evidence governance, change attribution, validation limits and GRI v1.2 proof lineage.";

const RESEARCH_AREAS = [
  {
    icon: Gauge,
    title: "Risk Indices methodology",
    body: "Understand how geopolitical, macroeconomic and critical-mineral risk are presented separately while preserving the versioned GRI v1.2 evidence controls and verified proof lineage behind the current readings.",
    to: "/docs/gri-architecture" as const,
    cta: "Open methodology & proof",
  },
  {
    icon: Fingerprint,
    title: "Proof & reproducibility",
    body: "Trace the current public Risk Indices to their verified parent snapshot, evidence, calculation inputs, methodology version and integrity hashes.",
    to: "/global-risk" as const,
    cta: "Verify current Risk Indices",
  },
  {
    icon: GitBranch,
    title: "Change attribution",
    body: "See which domain and event-level contributions moved in the underlying verified methodology instead of relying on an explanation written after the score changed.",
    to: "/docs/20-change-attribution" as const,
    cta: "Read attribution methodology",
  },
  {
    icon: ShieldCheck,
    title: "Source governance & reliability",
    body: "Review source eligibility, provenance, independence, contradiction handling, confidence and fail-closed rules that determine what can support a risk reading.",
    to: "/docs/09-source-governance" as const,
    cta: "Read source governance",
  },
] as const;

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/research" },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
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
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">See how each risk reading is built, changed and checked.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Geomacro publishes geopolitical, macroeconomic and critical-mineral risk separately. This research layer explains the evidence rules, proof lineage, change attribution and validation limits behind those readings without presenting methodology proof as predictive validation or external certification.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2"><Link to="/global-risk">Verify current Risk Indices <ArrowRight className="h-4 w-4" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/docs">Open documentation</Link></Button>
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/40 p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Current methodology boundary</p>
            <h2 className="mt-3 text-2xl font-semibold">Separate public indices, preserved versioned lineage.</h2>
          </div>
          <div className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>
              The current public Risk Indices project the verified geopolitical, macroeconomic and critical-mineral domain scores from the existing <span className="font-mono text-foreground">gri-v1.2.0</span> versioned proof package.
            </p>
            <p>
              The historical combined GRI remains a versioned proof record. It is not presented as a second live headline score, and the public split does not rewrite historical snapshots or invent a parallel browser calculation.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-14">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Core research areas</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">From evidence to readings you can trace.</h2>
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
            Research starts from the same current event evidence that users can inspect on the public Risk Intelligence page.
          </p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/intelligence">Open intelligence <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <FileSearch className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Public technical reference</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Documentation covers product architecture, source governance, the GRI v1.2 parent methodology, Risk Objects, Risk Gate, determinism, commercial boundaries and technical proof.
          </p>
          <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to="/docs/00-overview">Start from overview <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">What research evidence does not prove</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Reproducible methodology does not automatically prove commercial source rights, production security, predictive performance, independent certification or customer demand. Those require separate evidence.
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
            <p><span className="font-medium text-foreground">Deterministic aggregation:</span> once eligible inputs are fixed, the versioned v1.2 numerical aggregation does not use an LLM call or discretionary manual adjustment.</p>
            <p><span className="font-medium text-foreground">Validation limits:</span> correlation is not causation. Predictive, audit, certification or institutional-validation claims are made only when the specific preserved evidence supports them.</p>
          </div>
        </div>
      </section>

      <section className="mt-14 border-t border-border/60 pt-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Need the exact calculation and proof fields?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Use the technical documentation for the versioned GRI v1.2 parent methodology, then inspect the current separate Risk Indices and their retained proof fingerprints.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button asChild><Link to="/global-risk">Risk Indices</Link></Button>
            <Button asChild variant="outline"><Link to="/docs/gri-architecture">GRI v1.2 proof architecture</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}
