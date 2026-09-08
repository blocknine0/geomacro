import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Braces,
  Building2,
  CheckCircle2,
  Landmark,
  Radio,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AskGeomacroSection } from "@/components/home/ask-geomacro";
import { GlobalRiskIndexSection } from "@/components/home/gri-section";
import { useGlobalRisk } from "@/lib/use-global-risk";
import { GRI_METHOD_VERSION } from "@/lib/gri-current-contract";

const FLOW = [
  ["1", "Observe", "We collect current geopolitical and macro developments from governed sources."],
  ["2", "Structure", "Each development is classified, time-stamped and linked to the evidence behind it."],
  ["3", "Score & explain", "GRI and country or corridor views show the current risk level, what changed and how confident the evidence is."],
  ["4", "Deliver", "Analysts and software systems can use that context in their own review and approval process."],
] as const;

const PRODUCT_CARDS = [
  {
    icon: Radio,
    status: "LIVE",
    title: "Risk Intelligence",
    body: "See current geopolitical and macro developments with severity, confidence, evidence and context.",
    to: "/intelligence" as const,
    cta: "Explore intelligence",
  },
  {
    icon: Bot,
    status: "LIVE",
    title: "Ask Geomacro",
    body: "Ask about Geomacro's recorded evidence and current GRI. Answers stay within evidence Geomacro can cite.",
    to: "/ask-geomacro" as const,
    cta: "Ask a risk question",
  },
  {
    icon: ShieldCheck,
    status: "PRIVATE PILOT",
    title: "Risk Gate",
    body: "Check country or corridor risk before a payment or other financial action moves forward. The customer's own policy still decides what happens next.",
    to: "/risk-gate" as const,
    cta: "See Risk Gate",
  },
  {
    icon: Braces,
    status: "PUBLIC + PRIVATE PILOT",
    title: "Data & API",
    body: "Use public intelligence now, or request pilot access to signed Risk Objects and Risk Gate outputs for software workflows.",
    to: "/data-api" as const,
    cta: "View data access",
  },
] as const;

const BUYER_USE_CASES = [
  {
    icon: Landmark,
    title: "Treasury & payments",
    body: "Check country and corridor risk before changing limits, releasing a payment or escalating an approval.",
  },
  {
    icon: Building2,
    title: "Risk & strategy",
    body: "Track current risk, historical movement, evidence quality and exact change attribution in one reviewable workflow.",
  },
  {
    icon: RouteIcon,
    title: "Supply chain & commodities",
    body: "Monitor geopolitical, macro and critical-mineral developments that can affect sourcing, logistics and exposure decisions.",
  },
  {
    icon: Bot,
    title: "Software & agent systems",
    body: "Give automated financial workflows external risk context before the customer's own system decides whether to proceed.",
  },
] as const;

export function CommercialHome() {
  const risk = useGlobalRisk();

  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:pb-14 lg:pt-16">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:gap-14">
          <div className="min-w-0">
            <Badge
              variant="outline"
              className="gap-2 border-primary/40 bg-primary/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-primary"
            >
              <Radio className="h-3 w-3" /> Live geopolitical + macro risk intelligence
            </Badge>
            <h1 className="mt-6 max-w-4xl text-[clamp(2.4rem,6vw,5.4rem)] font-semibold leading-[0.98] tracking-tight">
              Know what changed. <span className="text-primary">Know why it matters.</span>
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Geomacro tracks geopolitical and macro developments, shows how risk is changing, and links each view back to evidence. Analysts can review it directly, while software systems can use the same context without handing execution control to Geomacro.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/intelligence">Explore intelligence <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/global-risk">View Global Risk Index</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link to="/institutional">Discuss a pilot</Link>
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>Public intelligence · Live</span>
              <span>Risk Gate · Private Pilot</span>
              <span>Arc / Circle · Technical Proof</span>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Public intelligence and research work without a wallet. Prediction markets, Arc and Circle flows are kept in a separate technical-proof area.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/55 p-6 backdrop-blur-sm sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">How Geomacro works</p>
              <span className="font-mono text-[10px] text-muted-foreground">GRI {GRI_METHOD_VERSION}</span>
            </div>
            <ol className="mt-6 space-y-5">
              {FLOW.map(([step, title, body]) => (
                <li key={step} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-xs text-primary">
                    {step}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <GlobalRiskIndexSection
        risk={risk.data}
        status={risk.status}
        error={risk.error}
        updatedAt={risk.updatedAt}
        retry={risk.retry}
      />

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Product surfaces</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Choose the part of Geomacro that fits the job.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Public intelligence and the GRI are live now. Ask Geomacro works from stored evidence. Risk Gate and API access are available only through a controlled Private Pilot.
          </p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PRODUCT_CARDS.map(({ icon: Icon, status, title, body, to, cta }) => (
            <article key={title} className="flex min-h-[260px] flex-col rounded-2xl border border-border/70 bg-card/50 p-6">
              <div className="flex items-center justify-between gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{status}</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              <Button asChild variant="link" className="mt-5 h-auto justify-start p-0">
                <Link to={to}>{cta} <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Risk Gate · Private Pilot</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Check risk before the action, not after.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A treasury system, payment workflow or agent sends the country or corridor context it needs checked. Risk Gate verifies the signed Risk Object, applies the customer's policy and returns a recommendation before anything is executed.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="gap-2"><Link to="/risk-gate">Open Risk Gate <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild variant="outline"><Link to="/institutional">Discuss a Private Pilot</Link></Button>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/40 p-6">
            <div className="font-mono text-xs text-muted-foreground">Current Private Pilot control flow</div>
            <div className="mt-5 space-y-3 text-sm">
              {[
                "Action submitted for review",
                "Country / corridor Risk Object verified",
                "Evidence, confidence and freshness checked",
                "Customer policy applied",
                "Recommendation returned to the customer's system",
              ].map((text) => (
                <div key={text} className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {text}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Geomacro does not authorize or execute the transaction. `execution_authorized` remains false, and the customer decides what happens next.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Who Geomacro is for</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Built for teams that already have a decision process.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Geomacro adds a documented external-risk view to research, review, approval and monitoring workflows. It supports the decision; it does not replace the decision-maker.
            </p>
            <Button asChild variant="outline" className="mt-6 gap-2">
              <Link to="/institutional">Explore institutional workflows <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {BUYER_USE_CASES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-border/70 bg-card/50 p-5">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <AskGeomacroSection />

      <section className="mx-auto w-full max-w-7xl px-4 pb-14 pt-4 sm:px-6 sm:pb-18">
        <div className="rounded-2xl border border-border/70 bg-card/45 p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Secondary technical proof</p>
              <h2 className="mt-3 text-2xl font-semibold">Arc, Circle and prediction markets remain available as technical proof.</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                They show the onchain and programmable-finance work already implemented on testnet. They are not the main commercial product.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild variant="outline"><Link to="/pipeline">Data Pipeline</Link></Button>
              <Button asChild variant="outline"><Link to="/arena">Prediction Markets</Link></Button>
              <Button asChild variant="outline"><Link to="/onchain">Arc / Onchain</Link></Button>
              <Button asChild variant="outline"><Link to="/bridge-swap">Bridge & Swap</Link></Button>
            </div>
          </div>
          <div className="mt-6 border-t border-border/60 pt-5 text-sm text-muted-foreground">
            For methodology and implementation details, use <Link to="/research" className="text-primary hover:underline">Research</Link>, <Link to="/docs" className="text-primary hover:underline">Documentation</Link> or <Link to="/about" className="text-primary hover:underline">About & Trust</Link>.
          </div>
        </div>
      </section>
    </>
  );
}
