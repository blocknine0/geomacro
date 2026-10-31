import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ApiKeysNotice } from "@/components/api-keys-notice";
import { CapabilityPriceSchedule } from "@/components/capability-price-schedule";
import {
  GEOMACRO_LOW_BARRIER_VERSION,
  GEOMACRO_SUBSCRIPTIONS,
  GEOMACRO_ONE_TIME_PACKS,
  GEOMACRO_AGENT_MICROPAYMENT,
  GEOMACRO_SUBSCRIPTION_CHECKOUT_STATUS,
  GEOMACRO_CREDIT_PACK_CHECKOUT_STATUS,
} from "@/lib/low-barrier-pricing";
import {
  GEOMACRO_CAPABILITY_PRICING_VERSION,
  publicCapabilityPricingCatalog,
} from "@/lib/capability-pricing-catalog";

const TITLE = "API & Agents | Geomacro";
const DESCRIPTION =
  "Geomacro structured intelligence API: $9/$29/$99 monthly credit plans, $5/$15/$30 top-ups, and evidence-gated Base USDC x402 pricing from $0.02 to $0.05 per successful delivery.";
const URL = "https://geomacro.live/data-api";

const offerRows = publicCapabilityPricingCatalog();
const displayName = (value: string) => value.replaceAll("_", " ");

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
    <main className="gm-container py-12 sm:py-16">
      <header className="max-w-3xl">
        <p className="gm-eyebrow">API & Agents</p>
        <h1 className="gm-page-title">Structured intelligence for applications and agents.</h1>
        <p className="gm-intro">
          Geopolitics, Macro / FX and Critical Minerals. Choose a monthly credit plan,
          add one-time credits, or prepare exact Base USDC x402 payments for eligible
          machine-delivered intelligence. Prices are published; checkout is not yet live.
        </p>
      </header>

      <div className="mt-8"><ApiKeysNotice /></div>

      <section
        className="mt-10 space-y-7"
        aria-label="API plans and credit packs"
        data-pricing-version={GEOMACRO_LOW_BARRIER_VERSION}
      >
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="gm-eyebrow">Monthly plans</p>
              <h2 className="mt-2 text-2xl font-semibold">Pay for the intelligence you use.</h2>
            </div>
            <Link to="/pricing" className="gm-text-link">
              Full plan details <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Credits refresh every 30 days. An intelligence query costs 1 credit;
            advanced products may use more. Only verified, eligible deliveries qualify.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {GEOMACRO_SUBSCRIPTIONS.map((plan) => (
              <article
                key={plan.id}
                data-plan-id={plan.id}
                className="rounded-xl border border-border bg-card/40 p-5"
              >
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-2 text-2xl font-semibold">
                  ${plan.price_usd}<span className="text-sm font-normal text-muted-foreground"> USD / month</span>
                </p>
                <p className="mt-2 text-sm">
                  {plan.credits_per_30_days.toLocaleString("en-US")} credits / 30 days
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {plan.features.join(" · ")}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold">One-time credit packs</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No auto-renewal. Credits are added only after a verified payment and
            idempotent funding receipt.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {GEOMACRO_ONE_TIME_PACKS.map((pack) => (
              <article
                key={pack.id}
                data-pack-id={pack.id}
                className="rounded-xl border border-border p-4"
              >
                <h3 className="font-semibold">{pack.name} pack · ${pack.price_usd} USD</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pack.credits.toLocaleString("en-US")} one-time credits
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border p-5">
          <p className="gm-eyebrow">AI Agents · Base USDC x402</p>
          <h2 className="mt-2 text-xl font-semibold">
            ${GEOMACRO_AGENT_MICROPAYMENT.minimum_usdc}–${GEOMACRO_AGENT_MICROPAYMENT.maximum_usdc} USDC
            <span className="text-sm font-normal text-muted-foreground"> per eligible successful delivery</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Base mainnet · USDC. The exact price depends on capability and variant.
            Every payment requires an eligible source, an exact approved quote,
            verified settlement and successful structured delivery. No blind
            charge for unavailable or unverified data.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Subscription checkout: {GEOMACRO_SUBSCRIPTION_CHECKOUT_STATUS.replaceAll("_", " ").toLowerCase()}.
          Credit pack checkout: {GEOMACRO_CREDIT_PACK_CHECKOUT_STATUS.replaceAll("_", " ").toLowerCase()}.
          These catalog prices are not an offer to collect funds.
        </p>
      </section>

      <section className="mt-10" aria-label="Per-capability Base USDC prices" data-capability-pricing-version={GEOMACRO_CAPABILITY_PRICING_VERSION}>
        <h2 className="text-2xl font-semibold">Agent delivery rate card</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Published prices for new sales. These are not executable payment
          requirements; each request must independently pass availability and rights checks.
        </p>
        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Product</th>
                <th scope="col" className="px-4 py-3 font-semibold">Variant</th>
                <th scope="col" className="px-4 py-3 font-semibold">USDC / delivery</th>
                <th scope="col" className="px-4 py-3 font-semibold">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {offerRows.flatMap((row) =>
                row.variants.map((price) => (
                  <tr key={row.capability + ":" + price.variant}>
                    <td className="px-4 py-3 capitalize">{displayName(row.capability)}</td>
                    <td className="px-4 py-3 capitalize">{displayName(price.variant)}</td>
                    <td className="px-4 py-3 font-mono">{price.amount_usdc}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.launch_status === "COMING_SOON"
                        ? "Coming soon · no checkout"
                        : "Eligibility gated"}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10"><CapabilityPriceSchedule compact /></div>
      <p className="mt-6 max-w-3xl text-sm leading-6 text-muted-foreground">
        All products deliver structured Geomacro JSON. Availability is checked for each request.
        Risk Gate includes its Signed Risk Object without a second object charge.
        Signed risk products are private pilots; customers retain control of every action.
      </p>
      <p className="mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">
        Paid API requests become available only when the live payment and delivery service confirms activation.
      </p>
      <div className="mt-8 flex flex-wrap gap-6 border-t border-border pt-6">
        <Link to="/contact" className="gm-text-link">
          Discuss your workflow <ArrowRight className="h-4 w-4" />
        </Link>
        <Link to="/docs" className="gm-text-link">
          Developer documentation <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </main>
  );
}
