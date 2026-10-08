import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleGauge,
  Globe2,
  Landmark,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveIntelligenceShowcase } from "@/components/home/live-intelligence-showcase";

const DOMAINS = [
  {
    title: "Geopolitical risk",
    body: "Track policy, conflict, sanctions and cross-border changes without turning a news stream into your workflow.",
    icon: Globe2,
  },
  {
    title: "Macro & FX risk",
    body: "See the macro conditions and external-pressure signals that can change country, treasury and operating decisions.",
    icon: Landmark,
  },
  {
    title: "Critical minerals",
    body: "Monitor rare-earth and strategic-mineral concentration, sourcing pressure and geopolitical dependency.",
    icon: Layers3,
  },
] as const;

const OUTPUTS = [
  "What changed",
  "Why it matters",
  "Likely impact",
  "Confidence",
  "What to watch next",
] as const;

const BUYERS = [
  ["Risk & strategy", "Turn external events into reviewable risk context."],
  ["Treasury & operations", "Add country and macro context to escalation workflows."],
  ["Supply chain", "Track mineral, sourcing and geopolitical concentration risk."],
  ["AI agents", "Consume bounded, machine-readable intelligence instead of raw data dumps."],
] as const;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-primary sm:text-xs">
      {children}
    </p>
  );
}

export function CommercialHome() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_16%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_33%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-18 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:gap-16 lg:pb-24 lg:pt-24">
          <div className="max-w-3xl">
            <Eyebrow>Global risk intelligence for humans and machines</Eyebrow>
            <h1 className="mt-5 text-[clamp(2.9rem,7vw,6.4rem)] font-semibold leading-[0.92] tracking-[-0.055em]">
              Know what changed.
              <span className="mt-1 block text-primary">Know why it matters.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Geomacro turns geopolitical, macroeconomic and critical-mineral developments into concise, explainable risk intelligence built for decisions, workflows and AI agents.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="h-12 gap-2 px-6">
                <Link to="/intelligence">Explore Intelligence <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6">
                <Link to="/data-api">API & Agent Access</Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="h-12 px-5">
                <Link to="/global-risk">View Risk Indices</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground sm:text-sm">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Explainable</span>
              <span className="inline-flex items-center gap-2"><CircleGauge className="h-4 w-4 text-primary" /> Confidence-aware</span>
              <span className="inline-flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Machine-readable</span>
            </div>
          </div>

          <LiveIntelligenceShowcase />
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <Eyebrow>Three risk domains</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-5xl">One place to understand the external risks that move decisions.</h2>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {DOMAINS.map(({ title, body, icon: Icon }) => (
            <article key={title} className="group rounded-2xl border border-border/65 bg-card/35 p-6 transition duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card/60 sm:p-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div>
            <Eyebrow>Built for clarity</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Not another raw-data feed.</h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              Geomacro keeps raw evidence and provenance inside the intelligence system, then delivers concise decision context instead of forcing users or machines to interpret a data dump.
            </p>
            <Button asChild variant="outline" className="mt-7">
              <Link to="/about">How Geomacro works <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-border/65 bg-background/30 p-5 sm:p-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Every useful answer is organized around</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {OUTPUTS.map((item, index) => (
                <div key={item} className={index === OUTPUTS.length - 1 ? "sm:col-span-2" : ""}>
                  <div className="flex items-center gap-3 rounded-xl border border-border/55 bg-card/30 px-4 py-4">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm font-medium">{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-start">
          <div>
            <Eyebrow>Critical minerals & rare earths</Eyebrow>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">See concentration and sourcing risk before it becomes a procurement surprise.</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
              Dedicated intelligence connects supply concentration, geopolitical dependency, policy pressure and related macro exposure without mixing them into one opaque score.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild><Link to="/global-risk">Explore Critical Minerals Risk</Link></Button>
              <Button asChild variant="ghost"><Link to="/intelligence">View supporting intelligence</Link></Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {["Supply concentration", "Geopolitical dependency", "Policy & export pressure", "Macro exposure"].map((item) => (
              <div key={item} className="rounded-2xl border border-border/60 bg-card/30 p-5">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="mt-4 text-sm font-semibold">{item}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">Structured as separate drivers so users can see what is actually changing.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Eyebrow>Built for real workflows</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Useful to people. Structured for machines.</h2>
            </div>
            <Button asChild variant="outline"><Link to="/institutional">Institutional use cases</Link></Button>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {BUYERS.map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-border/55 bg-background/25 p-5 sm:p-6">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_55%)] p-6 sm:p-9 lg:flex lg:items-center lg:justify-between lg:gap-12">
          <div className="max-w-3xl">
            <Eyebrow>Explore Geomacro</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Start with the intelligence. Integrate when your workflow is ready.</h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">Public exploration stays simple. Machine and commercial access lives in dedicated product surfaces with explicit availability and product boundaries.</p>
          </div>
          <div className="mt-7 flex shrink-0 flex-col gap-3 sm:flex-row lg:mt-0 lg:flex-col xl:flex-row">
            <Button asChild size="lg" className="gap-2"><Link to="/intelligence">Open Intelligence <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/contact">Contact Geomacro</Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}
