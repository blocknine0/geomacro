import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Landmark,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const TITLE = "Institutional Risk Intelligence | Geomacro";
const DESCRIPTION =
  "Commercial geopolitical, macroeconomic and critical-minerals risk intelligence for treasury, strategy, supply-chain and research teams.";

const USE_CASES = [
  [Landmark, "Treasury & operations", "Add country and macro context to review, escalation and exposure decisions without turning operators into full-time risk analysts."],
  [Building2, "Risk & strategy", "See what changed, why it matters, confidence and the drivers behind risk movement in one reviewable workflow."],
  [RouteIcon, "Supply chain & commodities", "Track critical-mineral, rare-earth and geopolitical concentration relevant to sourcing and operational continuity."],
  [Search, "Research teams", "Move from fragmented developments to structured intelligence that can be challenged, compared and revisited."],
] as const;

const DELIVERABLES = [
  "Live Intelligence across geopolitical, macroeconomic and critical-minerals domains",
  "Separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices",
  "Dedicated Critical Minerals & Rare Earth Risk coverage",
  "Ask Geomacro for grounded evidence-backed questions",
  "Research, evidence and methodology for professional review",
] as const;

const ROADMAP = [
  "Governed machine/API delivery",
  "Signed Risk Objects and Risk Gate",
  "Paid agent and x402 production access",
  "Additional automated delivery workflows",
] as const;

export const Route = createFileRoute("/institutional")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/institutional" },
      { property: "og:image", content: "https://geomacro.live/og-signal-card-v2.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/institutional" }],
  }),
  component: InstitutionalPage,
});

function InstitutionalPage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border/55">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,color-mix(in_oklab,var(--primary)_13%,transparent),transparent_30%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-4 py-12 sm:px-6 sm:py-18 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-22">
          <div>
            <Badge variant="outline" className="border-primary/25 bg-primary/5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">COMMERCIAL RISK INTELLIGENCE</Badge>
            <h1 className="mt-5 max-w-5xl text-[clamp(2.8rem,6vw,5.6rem)] font-semibold leading-[0.96] tracking-[-0.05em]">
              External risk should arrive as a decision signal, not a research burden.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Geomacro turns geopolitical, macroeconomic and critical-mineral change into explainable context for teams that need to review risk quickly, defend a decision and understand what moved.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="h-12 gap-2 px-6"><Link to="/contact">Discuss commercial access <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6"><Link to="/intelligence">Explore Intelligence</Link></Button>
              <Button asChild size="lg" variant="ghost" className="h-12 px-5"><Link to="/global-risk">Risk Indices</Link></Button>
            </div>
          </div>

          <div className="rounded-[1.65rem] border border-border/65 bg-card/60 p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.17em] text-muted-foreground">A review-ready answer</p>
            <div className="mt-5 space-y-3">
              {["What changed?", "Why does it matter?", "What is driving it?", "How confident is the signal?", "What should the team watch next?"].map((item, index) => (
                <div key={item} className="flex items-center justify-between gap-3 rounded-xl border border-border/55 bg-background/30 px-4 py-3.5">
                  <span className="text-sm font-medium">{item}</span>
                  <span className="font-mono text-[10px] text-primary">0{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Applied workflows</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Different teams. One governed risk state.</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">Geomacro is useful when the same external event affects different operating decisions. Each team can consume the relevant context without building a separate research stack.</p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-2">
          {USE_CASES.map(([Icon, title, body]) => (
            <article key={title} className="group rounded-2xl border border-border/60 bg-card/35 p-6 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/55">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Available at launch</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">A reviewable risk product, not a black-box alert feed.</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">The public launch surface is built around inspectable intelligence and explicit risk domains. Machine and automation layers remain separate until their own gates are satisfied.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {DELIVERABLES.map((item, index) => (
              <div key={item} className={index === DELIVERABLES.length - 1 ? "sm:col-span-2" : ""}>
                <div className="flex h-full gap-3 rounded-xl border border-border/60 bg-background/30 p-5 text-sm leading-6">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-border/60 bg-card/35 p-6 lg:col-span-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Critical minerals & rare earths</p>
            <h2 className="mt-3 text-2xl font-semibold">Bring supply concentration and geopolitical dependency into the same conversation.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Supply concentration, policy pressure, sourcing exposure and macro context stay visible as separate drivers rather than disappearing inside a generic composite risk score.</p>
            <Button asChild variant="outline" className="mt-6"><Link to="/global-risk">Explore Critical Minerals Risk</Link></Button>
          </article>
          <article className="rounded-2xl border border-border/60 bg-card/35 p-6">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Product boundary</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">Prediction Markets, Bridge and Swap remain separate testnet technical proofs and are not the institutional risk-intelligence product.</p>
          </article>
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_.85fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Commercial progression</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">The intelligence comes first. Automation follows the evidence.</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">Risk Gate, paid agent/x402 production access and broader machine delivery remain roadmap or controlled capabilities until separately promoted.</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/30 p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Machine and automation layers come later</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              {ROADMAP.map((item) => <li key={item} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{item}</span></li>)}
            </ul>
            <Button asChild variant="outline" className="mt-6"><Link to="/roadmap">View roadmap</Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_58%)] p-6 sm:p-9 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Work with Geomacro</p>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Bring a real risk-sensitive workflow.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">Tell us the decision, geography, domain and freshness requirement. Geomacro will state what is live, what is Private Pilot and what is not yet supported before any commercial commitment.</p>
          </div>
          <Button asChild size="lg" className="mt-7 shrink-0 gap-2 lg:mt-0"><Link to="/contact">Contact Geomacro <ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
      </section>
    </main>
  );
}
