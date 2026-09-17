import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Globe2,
  Handshake,
  Landmark,
  Network,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentCommerceStatus } from "@/components/agent-commerce-status";

const VALUE_PILLARS = [
  {
    icon: Globe2,
    title: "See external risk earlier",
    body: "Turn geopolitical, macroeconomic and critical-mineral developments into structured risk context before they become a decision problem.",
  },
  {
    icon: ShieldCheck,
    title: "Understand why risk changed",
    body: "Keep evidence, confidence, provenance and change attribution attached to the risk view instead of relying on an unexplained score.",
  },
  {
    icon: Network,
    title: "Use the same context across people and software",
    body: "Analysts can review the intelligence while software and AI agents can consume bounded machine-readable context through controlled delivery layers.",
  },
] as const;

const ADOPTION_REASONS = [
  "One external-risk layer across geopolitical, macro and critical-mineral domains",
  "Evidence-first outputs designed to be reviewable rather than black-box signals",
  "Fail-closed handling when required data or verification is missing",
  "Human workflows and machine workflows can share the same underlying intelligence state",
  "Customer identity, permissions, policy and execution remain customer-controlled",
] as const;

const BUYER_USE_CASES = [
  {
    icon: Landmark,
    title: "Treasury & payments",
    body: "Add country and corridor risk context before payment, exposure or approval decisions.",
  },
  {
    icon: Building2,
    title: "Risk & strategy",
    body: "Track external risk changes with a reviewable evidence trail and explicit confidence boundaries.",
  },
  {
    icon: RouteIcon,
    title: "Supply chain & commodities",
    body: "Monitor geopolitical, macro and critical-mineral developments that can affect sourcing and operational exposure.",
  },
  {
    icon: Bot,
    title: "AI & financial software",
    body: "Give automated systems current external-risk context before the customer's own controls decide what happens next.",
  },
] as const;

const PRODUCT_STATUS = [
  ["LIVE", "Risk Intelligence", "Current geopolitical, macroeconomic and critical-mineral intelligence with evidence and confidence context."],
  ["LIVE", "Separate Risk Indices", "Geopolitical, Macroeconomic and Critical Minerals risk are presented independently."],
  ["LIVE", "Ask Geomacro", "Grounded Q&A over Geomacro's recorded evidence and current risk context."],
  ["PRIVATE PILOT", "Risk Gate + signed Risk Objects", "Controlled country and directional-corridor decision context; not general production availability."],
] as const;

export function CommercialHome() {
  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:pb-20 lg:pt-20">
        <div className="max-w-5xl">
          <Badge variant="outline" className="border-primary/40 bg-primary/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
            Global risk intelligence infrastructure
          </Badge>
          <h1 className="mt-6 max-w-5xl text-[clamp(2.7rem,6.2vw,5.8rem)] font-semibold leading-[0.96] tracking-tight">
            Turn world events into <span className="text-primary">decision-ready risk context.</span>
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Geomacro converts geopolitical, macroeconomic and critical-mineral developments into explainable risk intelligence for institutions, operators and AI systems.
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Instead of another news feed or opaque score, Geomacro connects the risk view to evidence, confidence, provenance and what changed, so teams can understand the context before they act.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/institutional">See how teams use Geomacro <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/global-risk">Explore the product</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/contact">Discuss a partnership</Link>
            </Button>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <AgentCommerceStatus compact />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Risk Gate · controlled Private Pilot</span>
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">The problem Geomacro solves</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              External risk is scattered across news, data, research and specialist systems. Decisions still need one accountable context.
            </h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {VALUE_PILLARS.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-border/70 bg-background/35 p-6">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Why adopt Geomacro</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A risk layer built to be inspected, integrated and controlled.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Geomacro is designed to complement existing research, treasury, compliance, risk and software workflows rather than replace them. The customer keeps control of policy and execution.
          </p>
          <Button asChild variant="outline" className="mt-6 gap-2">
            <Link to="/about">Review trust & product boundaries <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="space-y-3">
          {ADOPTION_REASONS.map((reason) => (
            <div key={reason} className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/45 px-5 py-4 text-sm leading-relaxed">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{reason}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Who it is for</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Built around real risk-sensitive workflows.</h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {BUYER_USE_CASES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-border/70 bg-background/35 p-5">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Product status</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Clear about what is live, and what is still controlled.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Geomacro does not present Private Pilot or pre-launch commercial capabilities as generally available production services.
            </p>
          </div>
          <Button asChild variant="outline"><Link to="/roadmap">View full roadmap</Link></Button>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {PRODUCT_STATUS.map(([status, title, body]) => (
            <article key={title} className="rounded-2xl border border-border/70 bg-card/45 p-5">
              <p className={`font-mono text-[9px] uppercase tracking-[0.14em] ${status === "LIVE" ? "text-primary" : "text-amber-300"}`}>{status}</p>
              <h3 className="mt-2 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Handshake className="h-5 w-5" />
              <p className="font-mono text-xs uppercase tracking-[0.18em]">Ecosystem & partnership</p>
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">A useful risk layer becomes more valuable when it connects to the systems where decisions already happen.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Geomacro is open to infrastructure, data, distribution, financial-services and AI partnerships that can bring verifiable external-risk context closer to real customer workflows.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="gap-2"><Link to="/contact">Explore a partnership <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild variant="outline"><a href="/ecosystem">View ecosystem</a></Button>
            </div>
          </div>
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 sm:p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Circle Alliance Program</p>
            <h3 className="mt-3 text-2xl font-semibold">Geomacro is listed in the Circle Alliance Directory.</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The membership sits alongside Geomacro's Circle and Arc technical work. It is ecosystem participation, not an endorsement of Geomacro's risk methodology or customer decisions.
            </p>
            <a
              href="https://partners.circle.com/partner/geomacro"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Verify in Circle's directory <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="rounded-3xl border border-primary/25 bg-primary/[0.05] p-7 sm:p-10">
          <div className="max-w-4xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Work with Geomacro</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Bring one real risk-sensitive workflow. We will show where Geomacro fits and where it does not.</h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
              For design partners, data and infrastructure providers, financial platforms, AI-agent ecosystems and institutional teams evaluating external-risk decision infrastructure.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2"><Link to="/contact">Start a conversation <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/institutional">Institutional use cases</Link></Button>
              <Button asChild size="lg" variant="ghost"><Link to="/docs">Technical documentation</Link></Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
