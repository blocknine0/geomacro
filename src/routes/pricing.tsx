import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, CircleDollarSign, ShieldCheck } from "lucide-react";
import { AgentCommerceStatus } from "@/components/agent-commerce-status";
import { Button } from "@/components/ui/button";

const TITLE = "Pricing | Geomacro";
const DESCRIPTION =
  "Geomacro access and pricing: free public intelligence exploration and governed x402 pay-per-successful-delivery machine access.";
const URL = "https://geomacro.live/pricing";

const FREE_ACCESS = [
  "Public Intelligence explorer",
  "Separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices",
  "Ask Geomacro grounded query experience",
  "Public research, methodology and trust documentation",
] as const;

const PAID_ACCESS = [
  "Decision-ready derived Geomacro intelligence",
  "Current risk state, direction, confidence and top drivers when available",
  "Machine-readable structured delivery",
  "Stable state and delivery identifiers for integrations",
  "Fail-closed delivery when a fresh eligible result cannot be produced",
] as const;

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <main>
      <section className="border-b border-border/55">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Access & pricing
          </p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_.72fr] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-[clamp(2.7rem,6vw,5.4rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
                Free to explore. Pay only for successful commercial machine delivery.
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                The public Geomacro product remains free to explore. Governed machine access uses x402 and the launch offer is priced per successful settled and delivered intelligence call, not per failed request.
              </p>
            </div>
            <div className="rounded-2xl border border-border/65 bg-card/45 p-5 sm:p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Live commerce status
              </p>
              <div className="mt-4"><AgentCommerceStatus /></div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Payment availability is runtime-authoritative. Testnet configuration is not represented as commercial revenue, and real-money access remains fail-closed until separately authorized for production.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[1.65rem] border border-border/60 bg-card/35 p-6 sm:p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Free Explorer
            </p>
            <p className="mt-3 text-5xl font-semibold">$0</p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              For people evaluating Geomacro, following the public risk product, or reviewing its methodology and evidence boundaries.
            </p>
            <ul className="mt-7 space-y-3">
              {FREE_ACCESS.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-7 rounded-xl border border-border/60 bg-background/30 p-4 text-xs leading-5 text-muted-foreground">
              Free Explorer is website access. It does not include a free structured commercial API.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/intelligence">Open Intelligence</Link>
            </Button>
          </article>

          <article className="relative overflow-hidden rounded-[1.65rem] border border-primary/30 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--primary)_12%,var(--card)),var(--card)_48%)] p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                    x402 pay per call
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
                    <p className="text-5xl font-semibold">0.05</p>
                    <span className="pb-1 text-sm text-muted-foreground">USDC / successful delivery</span>
                  </div>
                </div>
                <CircleDollarSign className="h-6 w-6 text-primary" />
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Launch price for the first 20,000 successfully settled and delivered commercial intelligence calls. There is no subscription requirement for this launch offer.
              </p>
              <ul className="mt-7 space-y-3">
                {PAID_ACCESS.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 rounded-xl border border-primary/20 bg-background/25 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" /> No-charge failure boundary
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Failed, stale, unavailable, replayed, refunded, internal, testnet and unpaid requests do not count as successful paid deliveries.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/data-api">API & Agents <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/contact">Discuss integration</Link>
                </Button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
