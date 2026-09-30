import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentCommerceStatus } from "@/components/agent-commerce-status";

const TITLE = "API & Agent Access | Geomacro";
const DESCRIPTION =
  "Governed machine delivery for Geomacro geopolitical, macroeconomic and critical-mineral intelligence, including structured API responses, Risk Objects, Risk Gate and x402 access status.";
const URL = "https://geomacro.live/data-api";

const DELIVERY_STEPS = [
  ["01", "Ask", "A machine sends a bounded intelligence request."],
  ["02", "Preflight", "Geomacro checks capability, freshness, eligibility and delivery health before quoting payment."],
  ["03", "Settle", "x402 verifies the exact paid request without creating a second risk engine."],
  ["04", "Deliver", "The caller receives structured Geomacro intelligence with stable state and delivery identifiers."],
] as const;

const MACHINE_OUTPUTS = [
  ["Direct answer", "What changed, why it matters and the current decision context."],
  ["Current state", "Risk level, direction, confidence, top drivers and versioned state."],
  ["Structural context", "Bounded country or directional-corridor context when the governed capability supports it."],
  ["Integrity metadata", "Stable query, state and delivery identifiers for machine-side persistence and comparison."],
] as const;

const FREE_ACCESS = [
  "Public Intelligence explorer",
  "Separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices",
  "Ask Geomacro grounded query experience",
  "Public research, methodology and trust documentation",
] as const;

const PAID_ACCESS = [
  "Concise answer with what changed and why it matters",
  "Current risk state, direction, confidence and top drivers",
  "Bounded structural context and current developments",
  "Machine-readable JSON with stable state and delivery hashes",
  "Derived Geomacro intelligence only, not raw upstream data",
] as const;

export const Route = createFileRoute("/data-api")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: DataApiPage,
});

function DataApiPage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border/55">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,color-mix(in_oklab,var(--primary)_13%,transparent),transparent_30%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-18 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:py-22">
          <div className="max-w-3xl">
            <Badge variant="outline" className="border-primary/25 bg-primary/5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              GOVERNED DATA · CONTROLLED API · AGENT ACCESS
            </Badge>
            <h1 className="mt-5 text-[clamp(2.7rem,6vw,5.5rem)] font-semibold leading-[0.96] tracking-[-0.05em]">
              Risk intelligence machines can consume without the raw-data noise.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Geomacro delivers decision-ready geopolitical, macroeconomic and critical-mineral intelligence through governed machine interfaces. The intelligence stays canonical; API and x402 are delivery layers around the same verified product state.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="h-12 gap-2 px-6">
                <a href="#pricing">View access & pricing <ArrowRight className="h-4 w-4" /></a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6"><Link to="/docs">Developer documentation</Link></Button>
              <Button asChild size="lg" variant="ghost" className="h-12 px-5"><Link to="/contact">Discuss integration</Link></Button>
            </div>
          </div>

          <div className="rounded-[1.65rem] border border-border/65 bg-card/65 p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-7">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Commercial delivery status</p>
                <p className="mt-1 text-sm font-medium">Runtime truth, not marketing copy</p>
              </div>
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-5"><AgentCommerceStatus /></div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Real-money x402 access stays fail-closed until the production endpoint itself advertises an authorized production configuration.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">One commercial path</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Request → verify → settle → deliver.</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
            Payment never bypasses evidence, freshness, source-rights or product controls. If the requested capability cannot deliver, Geomacro fails closed instead of manufacturing a paid answer.
          </p>
        </div>
        <div className="mt-9 grid overflow-hidden rounded-2xl border border-border/65 bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
          {DELIVERY_STEPS.map(([step, title, body]) => (
            <article key={step} className="bg-background/88 p-5 sm:p-6">
              <p className="font-mono text-[10px] tracking-[0.16em] text-primary">{step}</p>
              <h3 className="mt-3 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">What a machine receives</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Decision context, not an upstream payload dump.</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              Commercial machine responses contain derived Geomacro intelligence. Upstream source URLs, publisher identities, raw provider payloads, raw article text and internal provenance blobs stay inside the governed evidence system.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {MACHINE_OUTPUTS.map(([title, text]) => (
              <article key={title} className="rounded-2xl border border-border/60 bg-background/35 p-5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Availability</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Know what is live before you integrate.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">Free Explorer is website/dashboard access, not a free API. Machine delivery is governed separately and its availability is stated explicitly.</p>
        </div>

        <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusCard icon={Database} status="LIVE" title="Public Intelligence" text="Geopolitical, macroeconomic and critical-mineral intelligence for browser research." />
          <StatusCard icon={Sparkles} status="LIVE" title="Risk Indices" text="Separate public geopolitical, macroeconomic and critical-mineral risk indices." />
          <StatusCard icon={Fingerprint} status="PRIVATE PILOT" title="Risk Objects & Risk Gate" text="Signed country and directional-corridor objects with bounded pre-decision context." />
          <StatusCard icon={Braces} status="RUNTIME STATUS ABOVE" title="x402 agent access" text="Commercial machine-payment status comes from the runtime, not a hard-coded production claim." />
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 border-y border-border/55 bg-card/15">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Access & pricing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Free to explore. x402 pay per successful commercial call.</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">No subscription tier is required for the launch offer. The public site remains free; commercial machine delivery is priced per successful x402 delivery in USDC.</p>
          </div>

          <div className="mt-9 grid gap-5 lg:grid-cols-2">
            <article className="rounded-[1.65rem] border border-border/60 bg-background/30 p-6 sm:p-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Free Explorer</p>
              <p className="mt-3 text-4xl font-semibold">$0</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">For people evaluating Geomacro or following the public risk-intelligence product.</p>
              <ul className="mt-6 space-y-3">
                {FREE_ACCESS.map((item) => <li key={item} className="flex gap-3 text-sm leading-6"><Check className="mt-1 h-4 w-4 shrink-0 text-primary" /><span>{item}</span></li>)}
              </ul>
              <p className="mt-6 rounded-xl border border-border/60 bg-card/30 p-4 text-xs leading-5 text-muted-foreground">Free Explorer does not include a free structured commercial API.</p>
              <Button asChild variant="outline" className="mt-6"><Link to="/intelligence">Open Free Explorer</Link></Button>
            </article>

            <article className="relative overflow-hidden rounded-[1.65rem] border border-primary/30 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--primary)_12%,var(--card)),var(--card)_48%)] p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">x402 pay per call</p>
                    <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
                      <p className="text-4xl font-semibold">0.05</p>
                      <span className="pb-1 text-sm text-muted-foreground">USDC / successful delivery</span>
                    </div>
                  </div>
                  <CircleDollarSign className="h-6 w-6 text-primary" />
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">Launch price for the first 20,000 successfully settled and delivered commercial intelligence calls. Failed, stale, unavailable, replayed, refunded, internal, testnet or unpaid requests do not count as successful paid deliveries.</p>
                <ul className="mt-6 space-y-3">
                  {PAID_ACCESS.map((item) => <li key={item} className="flex gap-3 text-sm leading-6"><Check className="mt-1 h-4 w-4 shrink-0 text-primary" /><span>{item}</span></li>)}
                </ul>
                <div className="mt-6 rounded-xl border border-primary/20 bg-background/25 p-4">
                  <p className="text-xs font-medium">No-charge failure policy</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">If Geomacro cannot deliver a fresh, eligible result, the request must fail closed rather than manufacture a chargeable answer.</p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <LockKeyhole className="h-5 w-5 text-primary" />
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Hard boundaries</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Commercial access does not weaken the product contract.</h2>
        </div>
        <div className="mt-9 grid gap-4 lg:grid-cols-3">
          <Boundary title="Country + corridor scope" text="The controlled corridor model is ENDPOINT_COMPOSED_V0_1. route_modeling_status = NOT_MODELED unless a future validated model explicitly changes that boundary." />
          <Boundary title="Customer controls execution" text="Risk Gate can return bounded context and recommendation, but execution_authorized=false. Identity, permissions, policy and final action stay customer-controlled." />
          <Boundary title="One intelligence foundation" text="Authentication, entitlement, payment and transport may differ by rail. The underlying governed intelligence and product-specific rules remain canonical." />
        </div>
      </section>

      <section className="border-t border-border/55">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_58%)] p-6 sm:p-9 lg:flex lg:items-center lg:justify-between lg:gap-10">
            <div className="max-w-3xl">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">Integrate only the capability your workflow needs.</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">Start with the free product, review the machine contract and pricing, then bring a concrete country, corridor or agent workflow for commercial evaluation.</p>
            </div>
            <Button asChild size="lg" className="mt-7 shrink-0 gap-2 lg:mt-0"><Link to="/contact">Contact Geomacro <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusCard({ icon: Icon, status, title, text }: { icon: typeof Database; status: string; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/60 bg-card/35 p-5 transition hover:border-primary/30 hover:bg-card/55 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{status}</span>
      </div>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}

function Boundary({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/60 bg-background/30 p-5 sm:p-6">
      <ShieldCheck className="h-4 w-4 text-primary" />
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}
