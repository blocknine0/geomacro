import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ApiKeysNotice } from "@/components/api-keys-notice";
import { CategoryApiPricing } from "@/components/category-api-pricing";
import { CapabilityPriceSchedule } from "@/components/capability-price-schedule";
import { StructuredProductSetup } from "@/components/structured-product-setup";
import {
  GEOMACRO_LAUNCH_PRICING_VERSION,
  GEOMACRO_LAUNCH_SUBSCRIPTIONS,
  GEOMACRO_LAUNCH_CREDIT_PACKS,
  GEOMACRO_LAUNCH_X402,
  GEOMACRO_LAUNCH_CHECKOUT,
} from "@/lib/launch-pricing";

const TITLE = "Pricing | GeoMacro";
const DESCRIPTION = "Start with $9/month or one-time $5 credits. GeoMacro structured Geopolitics, Macro/FX and Critical Minerals intelligence, plus Base USDC x402.";
const URL = "https://geomacro.live/pricing";

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
    <main className="gm-container py-12 sm:py-16" data-pricing-version={GEOMACRO_LAUNCH_PRICING_VERSION}>
      <header className="mb-9 max-w-3xl">
        <p className="gm-eyebrow">GeoMacro pricing</p>
        <h1 className="gm-page-title">Structured intelligence. Start at $9 a month.</h1>
        <p className="gm-intro">
          Geopolitics, Macro/FX and Critical Minerals. Choose monthly credits, a one-time
          credit pack, or machine-to-machine Base USDC x402 payments.
        </p>
      </header>

      <section aria-label="Monthly subscription plans">
        <h2 className="text-2xl font-semibold tracking-tight">Monthly plans</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {GEOMACRO_LAUNCH_SUBSCRIPTIONS.map((plan) => (
            <article key={plan.id} data-plan-id={plan.id} className="flex flex-col rounded-2xl border border-border bg-card/40 p-6">
              <h3 className="text-xl font-semibold">{plan.name}</h3>
              <p className="mt-4"><span className="text-4xl font-semibold">${plan.monthly_price_usd}</span><span className="text-sm text-muted-foreground"> / month</span></p>
              <p className="mt-2 font-medium">{plan.credits_per_30_days.toLocaleString("en-US")} credits / 30 days</p>
              <p className="mt-3 text-sm text-muted-foreground">{plan.audience}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {plan.benefits.map((benefit) => <li key={benefit}>• {benefit}</li>)}
              </ul>
              <a className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-primary px-4 font-medium text-primary hover:bg-primary/10"
                href={`mailto:contact@geomacro.live?subject=${encodeURIComponent(`GeoMacro ${plan.name} $ ${plan.monthly_price_usd}/month access`)}`}>
                Request this plan
              </a>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="One-time credit packs" className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">One-time credit packs</h2>
        <p className="mt-2 text-sm text-muted-foreground">Pay once. No recurring subscription required for these packs.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {GEOMACRO_LAUNCH_CREDIT_PACKS.map((pack) => (
            <article key={pack.id} data-pack-id={pack.id} className="rounded-2xl border border-border p-5">
              <h3 className="font-semibold">{pack.name}</h3>
              <p className="mt-3 text-3xl font-semibold">${pack.price_usd}</p>
              <p className="mt-1 text-sm text-muted-foreground">{pack.credits.toLocaleString("en-US")} credits · one-time</p>
              <a className="gm-text-link mt-4" href={`mailto:contact@geomacro.live?subject=${encodeURIComponent(`GeoMacro ${pack.name} prepaid access`)}`}>Request credit pack <ArrowRight className="h-4 w-4" /></a>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Base x402 micropayment pricing" className="mt-12 rounded-2xl border border-border p-6">
        <p className="gm-eyebrow">AI agents · Base USDC</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">x402 pay-per-call</h2>
        <p className="mt-3 text-3xl font-semibold">0.02–0.05 USDC <span className="text-sm font-normal text-muted-foreground">per eligible delivery</span></p>
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          {Object.entries(GEOMACRO_LAUNCH_X402.intelligence_complexity_usdc).map(([complexity,price]) => (
            <p key={complexity} className="rounded-lg bg-muted/40 p-4">
              <span className="block capitalize text-muted-foreground">{complexity.replaceAll("_", " ")}</span>
              <strong className="mt-1 block">{price} USDC</strong>
            </p>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Quotes require an eligible response, verified evidence and enabled settlement. A published catalog is not a live payment offer.</p>
      </section>

      <p className="mt-8 text-sm text-muted-foreground" data-checkout-status="prelaunch">
        {GEOMACRO_LAUNCH_CHECKOUT.checkout_instruction}. Self-service subscription and prepaid checkout
        are not active yet; payment-confirmed credit issuance and production x402 settlement
        still require acceptance.
      </p>
      <div className="mt-9"><ApiKeysNotice /></div>
      <div className="mt-10"><CategoryApiPricing /></div>
      <section id="product-catalog" className="mt-10 scroll-mt-24">
        <CapabilityPriceSchedule compact />
      </section>
      <StructuredProductSetup />
      <section className="mt-10 border-t border-border pt-8">
        <p className="text-sm text-muted-foreground">Need to explore first? Public intelligence remains free.</p>
        <Link to="/intelligence" className="gm-text-link mt-3">Open intelligence <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </main>
  );
}
