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
import { RiskIndicesSection } from "@/components/home/gri-section";
import { GRI_METHOD_VERSION } from "@/lib/gri-current-contract";

const FLOW = [
  ["1", "Observe", "Geomacro tracks governed geopolitical, macroeconomic and critical-mineral developments."],
  ["2", "Structure", "Events are classified, time-stamped and linked to the evidence behind them."],
  ["3", "Explain risk", "Separate Risk Indices, country/corridor context and change attribution show what moved and why."],
  ["4", "Deliver", "People can research directly. Software can consume governed machine-readable context without giving Geomacro execution control."],
] as const;

const PRODUCT_CARDS = [
  {
    icon: Radio,
    status: "LIVE",
    title: "Risk Intelligence",
    body: "Current geopolitical, macroeconomic and critical-mineral developments with severity, confidence, evidence and context.",
    to: "/intelligence" as const,
    cta: "Explore intelligence",
  },
  {
    icon: Bot,
    status: "LIVE",
    title: "Ask Geomacro",
    body: "Ask questions against Geomacro's recorded evidence and current Risk Indices instead of receiving unsupported certainty.",
    to: "/ask-geomacro" as const,
    cta: "Ask a risk question",
  },
  {
    icon: Braces,
    status: "MAINNET PRE-LAUNCH",
    title: "Agent Access",
    body: "Free research for people, professional plans for deeper use, and prepared pay-per-call intelligence for AI agents when mainnet is deliberately activated.",
    to: "/agent-access" as const,
    cta: "Preview agent access",
  },
  {
    icon: ShieldCheck,
    status: "PRIVATE PILOT",
    title: "Risk Gate",
    body: "Check country or corridor risk before a payment or financial action. The customer's own policy still decides what happens next.",
    to: "/risk-gate" as const,
    cta: "See Risk Gate",
  },
  {
    icon: Braces,
    status: "PUBLIC DATA + PRIVATE PILOT API",
    title: "Data & API",
    body: "Use public intelligence now, or request governed machine access to structured profiles, signed Risk Objects and Risk Gate outputs.",
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
    title: "Traders & market research",
    body: "Use geopolitical, macro and critical-mineral context as one documented input to a trading or market-monitoring process.",
  },
  {
    icon: Bot,
    title: "Software & AI agents",
    body: "Request governed external-risk context before the customer's own software decides whether to proceed.",
  },
] as const;

const ACCESS_LADDER = [
  ["FREE", "Explore", "Public intelligence, three Risk Indices, Ask Geomacro, research and methodology."],
  ["PAY PER CALL · PRE-LAUNCH", "AI agent", "Prepared 0.02 USDC per successful paid intelligence call, with free deliverability check first."],
  ["PROFESSIONAL", "Subscribe / pilot", "Deeper history, attribution, governed views and agreed exports for analysts and professional users."],
  ["API + RISK GATE", "Integrate", "Governed machine delivery, signed Risk Objects and Risk Gate for scoped workflows."],
  ["INSTITUTIONAL", "Contract", "Higher volume, contracted coverage, controls and support where implemented and agreed."],
] as const;

export function CommercialHome() {
  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:pb-14 lg:pt-16">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)] lg:gap-14">
          <div className="min-w-0">
            <Badge
              variant="outline"
              className="gap-2 border-primary/40 bg-primary/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-primary"
            >
              <Radio className="h-3 w-3" /> Geopolitical · macroeconomic · critical-mineral risk intelligence
            </Badge>
            <h1 className="mt-6 max-w-5xl text-[clamp(2.4rem,6vw,5.4rem)] font-semibold leading-[0.98] tracking-tight">
              Understand global risk <span className="text-primary">before it becomes a decision problem.</span>
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Geomacro turns real-world geopolitical, macroeconomic and critical-mineral developments into explainable risk intelligence. It shows what changed, why it matters, which evidence supports the view and how software can consume the same context safely.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/intelligence">See what is happening now <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/global-risk">View Risk Indices</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/agent-access">Agent access & plans</Link>
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>Public intelligence · Live</span>
              <span>Agent pay-per-call · Mainnet pre-launch</span>
              <span>Risk Gate · Private Pilot</span>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Public intelligence works without a wallet. Mainnet real-money agent payments remain disabled until the coordinated commercial launch is explicitly authorized.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/55 p-6 backdrop-blur-sm sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Geomacro in 40 seconds</p>
              <span className="font-mono text-[10px] text-muted-foreground">Proof lineage · {GRI_METHOD_VERSION}</span>
            </div>
            <div className="mt-6 space-y-4">
              {[
                ["WHAT", "A risk-intelligence system for geopolitical, macroeconomic and critical-mineral developments."],
                ["HOW", "It connects events to evidence, confidence, freshness, Risk Indices and quantified change attribution."],
                ["WHO", "Traders, analysts, treasury/risk teams, developers and AI agents that need external risk context."],
                ["ACCESS", "Use public research free. Add professional depth, governed API access or pay-per-call machine intelligence when enabled."],
              ].map(([label, text]) => (
                <div key={label} className="grid grid-cols-[58px_minmax(0,1fr)] gap-3 border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{label}</span>
                  <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {FLOW.map(([step, title, body]) => (
              <article key={step} className="rounded-2xl border border-border/70 bg-background/35 p-5">
                <span className="font-mono text-xs text-primary">{step}</span>
                <h2 className="mt-2 text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <RiskIndicesSection />

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Product surfaces</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Use Geomacro at the level your workflow needs.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Public intelligence, Risk Indices and Ask Geomacro are live. Risk Gate and commercial API access are controlled Private Pilot products. Mainnet pay-per-call agent access is prepared but remains deliberately disabled before launch.
          </p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {PRODUCT_CARDS.map(({ icon: Icon, status, title, body, to, cta }) => (
            <article key={title} className="flex min-h-[250px] flex-col rounded-2xl border border-border/70 bg-card/50 p-6">
              <div className="flex items-center justify-between gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-right font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{status}</span>
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
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Commercial access</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Free for evaluation. Paid when you need depth, automation or scale.</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Traders and researchers can evaluate Geomacro without paying. Professional users can move into deeper plans. AI agents can use a pay-per-call path at mainnet launch instead of taking a subscription only to make occasional requests.
              </p>
              <Button asChild className="mt-6 gap-2">
                <Link to="/agent-access">Compare access options <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
            <div className="space-y-3">
              {ACCESS_LADDER.map(([status, title, body]) => (
                <div key={status} className="grid gap-2 rounded-xl border border-border/70 bg-background/35 p-4 sm:grid-cols-[180px_130px_minmax(0,1fr)] sm:items-start">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{status}</span>
                  <span className="font-medium text-foreground">{title}</span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{body}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Who Geomacro is for</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Useful where global events have to become a documented decision input.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Geomacro adds a reviewable external-risk layer to research, monitoring, approval and software workflows. It supports the decision; it does not replace the decision-maker.
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

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Risk Gate · Private Pilot</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Check risk before the action, not after.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A treasury system, payment workflow or agent sends the country or corridor context it needs checked. Risk Gate verifies the signed Risk Object and returns bounded external risk context and a recommendation. The customer's own identity, permissions and policy layer decides what happens next.
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
                "Risk Gate recommendation returned to the customer's system",
                "Customer-owned policy applied by the customer system",
                "Any downstream execution remains customer-controlled",
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

      <AskGeomacroSection />

      <section className="mx-auto w-full max-w-7xl px-4 pb-14 pt-4 sm:px-6 sm:pb-18">
        <div className="rounded-2xl border border-border/70 bg-card/45 p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Secondary technical proof</p>
              <h2 className="mt-3 text-2xl font-semibold">Arc, Circle and prediction markets remain separate technical proof.</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                They demonstrate onchain and programmable-finance implementation. They are not Geomacro's primary commercial identity, and prediction markets remain Testnet-only.
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
