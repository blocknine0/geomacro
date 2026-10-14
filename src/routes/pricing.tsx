import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Check, CircleDollarSign, Mail, ShieldCheck } from "lucide-react";
import { AgentCommerceStatus } from "@/components/agent-commerce-status";
import {GEOMACRO_PRICING_GROUPS,GEOMACRO_CAPABILITY_PRICES,
  GEOMACRO_CAPABILITY_PRICING_VERSION} from "@/lib/capability-pricing-catalog";
import { Button } from "@/components/ui/button";

const TITLE = "Pricing | Geomacro";
const DESCRIPTION =
  "Explore Geomacro risk intelligence free, access qualified intelligence per successful API call, or enquire about monthly and annual plans.";
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
                Explore for free. Choose the access that fits.
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Explore public risk intelligence at no cost. Get structured intelligence through pay-per-call access when available, or discuss a recurring plan for your team and applications.
              </p>
            </div>
            <div className="rounded-2xl border border-border/65 bg-card/45 p-5 sm:p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                API access
              </p>
              <div className="mt-4"><AgentCommerceStatus /></div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Pay-per-call availability is confirmed by the live checkout, not the advertised price.
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

          <article className="rounded-[1.65rem] border border-primary/30 bg-card/40 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">x402 capability-based pay per call</p>
                <h2 className="mt-3 text-2xl font-semibold">Exact prices before payment</h2>
              </div>
              <CircleDollarSign className="h-6 w-6 shrink-0 text-primary" />
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Pay only for successfully prepared, verified and deliverable intelligence. No mandatory subscription.
              Unavailable, expired or unverified products are not chargeable.
            </p>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">Price contract: {GEOMACRO_CAPABILITY_PRICING_VERSION}</p>
            <div className="mt-5 space-y-5">
              {GEOMACRO_PRICING_GROUPS.map((group) => (
                <div key={group.label} className="rounded-xl border border-border/60 p-4">
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <div className="mt-3 space-y-2">
                    {group.ids.map((id) => (
                      <div key={id} className="border-t border-border/35 pt-2 first:border-0 first:pt-0">
                        <p className="font-mono text-xs text-foreground">{id}</p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(GEOMACRO_CAPABILITY_PRICES[id]).map(([variant,amount]) => (
                            <span key={variant} className="text-xs text-muted-foreground">
                              {variant.replaceAll("_"," ")}: <strong className="text-foreground">{amount} USDC</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Risk Gate bundles include their signed Risk Object; no second object charge.
              Prices are the approved schedule, not a guarantee of live product availability.
              No hidden tier changes or credit-to-USDC conversions.
            </p>
            <ul className="mt-5 space-y-3">
              {PAID_ACCESS.map((item) => <li key={item} className="flex gap-3 text-sm leading-6">
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary" /><span>{item}</span>
              </li>)}
            </ul>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild><Link to="/data-api">API & Agents <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <Button asChild variant="outline"><Link to="/contact">Discuss integration</Link></Button>
            </div>
          </article>
        </div>
      </section>

      <section className="border-t border-border/55 bg-card/15">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Recurring & enterprise</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Intelligence on your terms.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
              For ongoing monitoring, agent integrations and teams requiring a defined commercial agreement.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-border/65 bg-background/35 p-6 sm:p-8">
              <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-amber-300">Coming Soon · Monthly checkout</p>
              <h3 className="mt-2 text-2xl font-semibold">Monthly access</h3>
              <p className="mt-3 flex-1 text-sm leading-7 text-muted-foreground">
                Recurring API and AI-agent usage with usage limits and delivery requirements agreed before activation.
              </p>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Monthly subscriptions are Coming Soon. You can request a tailored plan and quote now.
              </p>
              <Button asChild variant="outline" className="mt-6 self-start">
                <a href="mailto:contact@geomacro.live?subject=Geomacro%20monthly%20intelligence%20access">
                  Request monthly access <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
            <div className="flex flex-col rounded-2xl border border-border/65 bg-background/35 p-6 sm:p-8">
              <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-2xl font-semibold">Annual & enterprise</h3>
              <p className="mt-3 flex-1 text-sm leading-7 text-muted-foreground">
                Custom annual terms for larger teams, higher-volume delivery, supported integrations and governed access.
              </p>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Annual pricing is quoted directly. No unverified package price or automatic charge.
              </p>
              <Button asChild className="mt-6 self-start">
                <a href="mailto:contact@geomacro.live?subject=Geomacro%20annual%20enterprise%20access">
                  Email enterprise sales <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
