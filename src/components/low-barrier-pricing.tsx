import { GEOMACRO_CARD_TO_USDC_READINESS } from "@/lib/card-to-usdc-readiness";
import { GEOMACRO_SUBSCRIPTIONS, GEOMACRO_ONE_TIME_PACKS, GEOMACRO_AGENT_MICROPAYMENT, GEOMACRO_LOW_BARRIER_VERSION } from "@/lib/low-barrier-pricing";

/** Commercial discovery only: no fake Stripe URLs or unchecked payment capture. */
export function LowBarrierPricing() {
  return (
    <section aria-label="Monthly plans and one-time credits" data-pricing-version={GEOMACRO_LOW_BARRIER_VERSION} className="space-y-9">
      <div>
        <p className="gm-eyebrow">Monthly access</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Start small. Scale when you need to.</h2>
        <p className="mt-3 text-sm text-muted-foreground">Credits reset every 30 days. An intelligence query costs 1 credit; more advanced structured products use their published credit cost. Availability is evidence-gated.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {GEOMACRO_SUBSCRIPTIONS.map(plan => (
            <article key={plan.id} data-plan-id={plan.id} className="flex flex-col rounded-2xl border border-border p-6">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-4"><span className="text-3xl font-semibold">${plan.price_usd}</span><span className="text-sm text-muted-foreground"> USD / month</span></p>
              <p className="mt-2 font-medium">{plan.credits_per_30_days.toLocaleString("en-US")} credits / 30 days</p>
              <p className="mt-2 text-xs text-muted-foreground">{plan.audience}</p>
              <ul className="mt-4 flex-1 list-disc space-y-2 pl-4 text-sm text-muted-foreground">{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
              <a href={"mailto:contact@geomacro.live?subject=" + encodeURIComponent("Geomacro " + plan.name + " access")} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5">Request {plan.name} access</a>
              <p className="mt-2 text-xs text-muted-foreground">Card checkout not yet verified live</p>
            </article>
          ))}
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">One-time credit packs</h2>
        <p className="mt-2 text-sm text-muted-foreground">No auto-renewal. Credits are issued only after payment verification; pack checkout is not yet live.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {GEOMACRO_ONE_TIME_PACKS.map(pack => (
            <article key={pack.id} data-pack-id={pack.id} className="rounded-xl border border-border p-5">
              <h3 className="font-semibold">{pack.name} · ${pack.price_usd} USD</h3>
              <p className="mt-2 text-sm">{pack.credits.toLocaleString("en-US")} credits, one time</p>
              <a href={"mailto:contact@geomacro.live?subject=" + encodeURIComponent("Geomacro " + pack.name + " credit pack")} className="gm-text-link mt-3">Enquire about this pack</a>
            </article>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6" data-card-to-usdc-status={GEOMACRO_CARD_TO_USDC_READINESS.checkout_status}>
        <p className="gm-eyebrow">Card to crypto · Buyer does not need existing USDC</p>
        <h2 className="mt-2 text-xl font-semibold">Pay by card. Merchant receives USDC.</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          GeoMacro is preparing an optional regulated hosted checkout for eligible buyers.
          The payment provider would handle card payment, identity checks and crypto conversion,
          while GeoMacro receives verified Base USDC settlement. Customer availability
          depends on region and provider approval.
        </p>
        <ol className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
          <li className="rounded-lg border border-border/70 bg-background/70 p-3">1. Choose a plan or credit pack.</li>
          <li className="rounded-lg border border-border/70 bg-background/70 p-3">2. Complete the provider-hosted card and KYC flow.</li>
          <li className="rounded-lg border border-border/70 bg-background/70 p-3">3. Credits unlock only after verified crypto settlement.</li>
        </ol>
        <button type="button" disabled className="mt-5 min-h-11 rounded-lg border border-border bg-muted px-5 py-2 text-sm font-medium text-muted-foreground opacity-75">
          Card to USDC · Awaiting merchant approval
        </button>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          No checkout or charge is available yet. Provider fees and any identity verification
          must be disclosed before purchase. Monthly access may require manual renewal:
          recurring card charges are not authorized.
        </p>
      </div>
      <div className="rounded-2xl border border-border p-5 sm:p-6">
        <p className="gm-eyebrow">AI agents · Base USDC x402</p>
        <h2 className="mt-2 text-xl font-semibold">Pay only for eligible deliveries</h2>
        <p className="mt-2 text-sm text-muted-foreground">{GEOMACRO_AGENT_MICROPAYMENT.minimum_usdc}–{GEOMACRO_AGENT_MICROPAYMENT.maximum_usdc} USDC per successful call on Base. An exact x402 quote, merchant settlement and verified intelligence delivery are required before a charge. Not a guarantee of live payment availability.</p>
      </div>
    </section>
  );
}
