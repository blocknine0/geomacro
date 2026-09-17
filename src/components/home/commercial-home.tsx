import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentCommerceStatus } from "@/components/agent-commerce-status";

const VALUE_PILLARS = [
  {
    title: "See external risk earlier",
    body: "Turn geopolitical, macroeconomic and critical-mineral developments into structured risk context before they become a decision problem.",
  },
  {
    title: "Understand why risk changed",
    body: "Keep evidence, confidence, provenance and change attribution attached to the risk view instead of relying on an unexplained score.",
  },
  {
    title: "Use the same context across people and software",
    body: "Analysts can review the intelligence while software and AI agents consume bounded machine-readable context through controlled delivery layers.",
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
    title: "Treasury & payments",
    body: "Add country and corridor risk context before payment, exposure or approval decisions.",
  },
  {
    title: "Risk & strategy",
    body: "Track external risk changes with a reviewable evidence trail and explicit confidence boundaries.",
  },
  {
    title: "Supply chain & commodities",
    body: "Monitor geopolitical, macro and critical-mineral developments that can affect sourcing and operational exposure.",
  },
  {
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-muted-foreground">{children}</p>;
}

export function CommercialHome() {
  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:pb-24 lg:pt-24">
        <div className="max-w-5xl">
          <SectionLabel>Global risk intelligence infrastructure</SectionLabel>
          <h1 className="mt-5 max-w-5xl text-[clamp(2.7rem,6vw,5.6rem)] font-semibold leading-[0.98] tracking-[-0.035em]">
            Turn world events into decision-ready risk context.
          </h1>
          <p className="mt-7 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Geomacro converts geopolitical, macroeconomic and critical-mineral developments into explainable risk intelligence for institutions, operators and AI systems.
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            The focus is simple: show what changed, why it matters, how confident the evidence is, and what a team or system should review next.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/institutional">See how teams use Geomacro <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/global-risk">Explore the product</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-5">
            <AgentCommerceStatus compact />
            <span className="text-xs text-muted-foreground">Risk Gate · controlled Private Pilot</span>
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/10">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-18">
          <div className="max-w-3xl">
            <SectionLabel>The problem Geomacro solves</SectionLabel>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              External risk is scattered across news, data, research and specialist systems. Decisions still need one accountable context.
            </h2>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-8 md:grid-cols-3">
            {VALUE_PILLARS.map(({ title, body }) => (
              <article key={title} className="border-t border-border/70 pt-5">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div>
          <SectionLabel>Why adopt Geomacro</SectionLabel>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A risk layer built to be inspected, integrated and controlled.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Geomacro complements existing research, treasury, compliance, risk and software workflows rather than replacing them. The customer keeps control of policy and execution.
          </p>
          <Button asChild variant="outline" className="mt-6 gap-2">
            <Link to="/about">Review trust & product boundaries <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="border-t border-border/70">
          {ADOPTION_REASONS.map((reason) => (
            <div key={reason} className="flex items-start gap-3 border-b border-border/60 py-4 text-sm leading-relaxed">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{reason}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/10">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-18">
          <div className="max-w-3xl">
            <SectionLabel>Who it is for</SectionLabel>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Built around real risk-sensitive workflows.</h2>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-9 md:grid-cols-2 xl:grid-cols-4">
            {BUYER_USE_CASES.map(({ title, body }) => (
              <article key={title} className="border-t border-border/70 pt-5">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-18">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <SectionLabel>Product status</SectionLabel>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Clear about what is live, and what is still controlled.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Private Pilot and pre-launch capabilities are labelled separately from generally available product surfaces.
            </p>
          </div>
          <Button asChild variant="outline"><Link to="/roadmap">View full roadmap</Link></Button>
        </div>
        <div className="mt-9 border-t border-border/70">
          {PRODUCT_STATUS.map(([status, title, body]) => (
            <article key={title} className="grid gap-2 border-b border-border/60 py-5 md:grid-cols-[8.5rem_1fr_1.45fr] md:items-start md:gap-6">
              <p className={`text-xs font-medium ${status === "LIVE" ? "text-primary" : "text-amber-300"}`}>{status}</p>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/10">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Handshake className="h-4 w-4" />
              <SectionLabel>Ecosystem & partnership</SectionLabel>
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Risk intelligence is more useful when it can meet teams inside the systems they already use.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Geomacro is open to infrastructure, data, distribution, financial-services and AI partnerships that bring verifiable external-risk context closer to real customer workflows.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="gap-2"><Link to="/contact">Explore a partnership <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild variant="outline"><a href="/ecosystem">View ecosystem</a></Button>
            </div>
          </div>
          <div className="border-l border-border/70 pl-6 sm:pl-8">
            <p className="text-sm font-medium text-muted-foreground">Circle Alliance Program</p>
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

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-22">
        <div className="border-t border-border/70 pt-10">
          <div className="max-w-4xl">
            <SectionLabel>Work with Geomacro</SectionLabel>
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
