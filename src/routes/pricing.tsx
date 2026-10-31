import { LowBarrierPricing } from "@/components/low-barrier-pricing";
import { StructuredProductSetup } from "../components/structured-product-setup";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Braces, CheckCircle2, Code2, Database, Globe2, ShieldCheck } from "lucide-react";
import { CapabilityPriceSchedule } from "@/components/capability-price-schedule";
import { ApiKeysNotice } from "@/components/api-keys-notice";
import { CategoryApiPricing } from "@/components/category-api-pricing";
import { GEOMACRO_AGENT_MICROPAYMENT, GEOMACRO_LOW_BARRIER_VERSION } from "@/lib/low-barrier-pricing";
import { GEOMACRO_CAPABILITY_PRICING_VERSION } from "@/lib/capability-pricing-catalog";

const TITLE = "Store & API | Geomacro";
const DESCRIPTION =
  "One Geomacro Store & API: $9/$29/$99 monthly credit plans, $5/$15/$30 credit packs, and evidence-gated Base USDC x402 from $0.02 to $0.05.";
const URL = "https://geomacro.live/pricing";
const highlights = [
  { label: "Geopolitics", icon: Globe2 },
  { label: "Macro / FX", icon: Database },
  { label: "Critical Minerals", icon: ShieldCheck },
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
    <main className="gm-container pb-16 pt-8 sm:pt-12" data-store-api-unified={GEOMACRO_LOW_BARRIER_VERSION}>
      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background px-6 py-9 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-44 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 right-1/3 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(270px,0.8fr)] lg:items-center">
          <div>
            <p className="gm-eyebrow">Geomacro Store · API & Agents</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Intelligence for people.
              <span className="block text-primary">Built for machines.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              One place for monthly access, one-time credits and pay-per-delivery
              structured intelligence. Explore the products, compare real catalog
              prices and prepare API requests without a charge.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#plans" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
                Explore plans <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#api-products" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background/70 px-5 py-3 text-sm font-medium transition hover:border-primary/50">
                Explore API products <Code2 className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-muted-foreground">
              {highlights.map(({ label, icon: Icon }) => (
                <span key={label} className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border/80 bg-background/80 p-6 shadow-xl shadow-primary/5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Machine intelligence</span>
              <Braces className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <p className="mt-6 text-3xl font-semibold tracking-tight">
              {GEOMACRO_AGENT_MICROPAYMENT.minimum_usdc}–{GEOMACRO_AGENT_MICROPAYMENT.maximum_usdc}
              <span className="ml-2 text-sm font-medium text-muted-foreground">USDC</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Per eligible successful x402 delivery · Base</p>
            <div className="my-6 h-px bg-border" />
            <div className="space-y-3 text-sm">
              {[
                "Request-specific verified intelligence",
                "Transparent source coverage and limitations",
                "No charge for unqualified results",
              ].map((item) => (
                <p key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {item}
                </p>
              ))}
            </div>
            <p className="mt-6 rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
              Pricing catalog only. Self-service checkout and production settlement
              require separate verified activation.
            </p>
          </div>
        </div>
      </section>

      <nav aria-label="Explore Store and API" className="sticky top-16 z-30 -mx-4 mt-5 overflow-x-auto border-y border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl sm:top-[68px] sm:mx-0 sm:rounded-xl sm:border sm:px-5">
        <div className="flex min-w-max items-center gap-2 text-xs font-medium sm:gap-5">
          {[
            ["#plans", "Plans & credits"],
            ["#api-products", "API products"],
            ["#api-endpoints", "Endpoints"],
            ["#prepare", "Try a request"],
            ["#developer-access", "Get access"],
          ].map(([href, title]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{title}</a>
          ))}
        </div>
      </nav>

      <section id="plans" className="scroll-mt-40 pt-12 sm:pt-16">
        <div className="mb-7 max-w-3xl">
          <p className="gm-eyebrow">Flexible access · {GEOMACRO_LOW_BARRIER_VERSION}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Start small. Grow on your terms.
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Choose a monthly plan, top up credits when needed or use Base USDC x402
            for eligible agent calls. Credits and exact API delivery prices are different
            billing methods; never charged twice for the same request.
          </p>
        </div>
        <LowBarrierPricing />
      </section>

      <section id="api-products" className="scroll-mt-40 pt-14 sm:pt-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="gm-eyebrow">Structured product catalog</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              What every delivery includes.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Compare capabilities and exact approved USDC variants.
              All products deliver structured Geomacro JSON. Evidence and limitations are included.
            </p>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">{GEOMACRO_CAPABILITY_PRICING_VERSION}</span>
        </div>
        <div id="product-catalog" className="mt-8 scroll-mt-40">
          <CapabilityPriceSchedule />
        </div>
      </section>

      <section id="api-endpoints" className="scroll-mt-40 pt-14 sm:pt-20">
        <div className="mb-6">
          <p className="gm-eyebrow">Developer integration</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">One engine. Three categories.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose Geopolitics, Macro / FX or Critical Minerals.
            The same governed pricing and exact-question contract applies to every API.
          </p>
        </div>
        <CategoryApiPricing />
      </section>

      <section id="prepare" className="scroll-mt-40 pt-14 sm:pt-20">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Code2 className="h-4 w-4" aria-hidden />
          <p className="gm-eyebrow">No-charge request preparation</p>
        </div>
        <StructuredProductSetup />
      </section>

      <section id="developer-access" className="scroll-mt-40 pt-14 sm:pt-20">
        <div className="mb-6">
          <p className="gm-eyebrow">Launch access</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Ready to connect?</h2>
        </div>
        <ApiKeysNotice />
        <p className="mt-4 max-w-3xl text-xs leading-6 text-muted-foreground">
          Paid API requests become available only when the live payment and delivery service confirms activation.
          Availability is checked for each request. Signed risk products are private pilots;
          customers retain control of every action. This page does not request payment.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link to="/docs" className="group flex items-start justify-between gap-5 rounded-2xl border border-border p-6 transition hover:border-primary/40 hover:bg-primary/5">
            <div>
              <p className="text-base font-semibold">Developer documentation</p>
              <p className="mt-2 text-sm text-muted-foreground">API schemas, source eligibility and delivery contracts.</p>
            </div>
            <ArrowUpRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          </Link>
          <Link to="/contact" className="group flex items-start justify-between gap-5 rounded-2xl border border-border p-6 transition hover:border-primary/40 hover:bg-primary/5">
            <div>
              <p className="text-base font-semibold">Discuss your workflow</p>
              <p className="mt-2 text-sm text-muted-foreground">Pricing, volumes, integrations and private pilot qualification.</p>
            </div>
            <ArrowUpRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-5 border-t border-border pt-8 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Just exploring?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Read public findings and use Ask Geomacro for free.</p>
          <Link to="/intelligence" className="gm-text-link mt-4">
            Open intelligence <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Building for a team?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Discuss your scope, volume and delivery needs.</p>
          <Link to="/contact" className="gm-text-link mt-4">
            Contact Geomacro <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
