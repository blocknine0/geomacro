import { useState } from "react";
import { GEOMACRO_SUBSCRIPTIONS, GEOMACRO_ONE_TIME_PACKS, GEOMACRO_LOW_BARRIER_VERSION } from "@/lib/low-barrier-pricing";
import { LockedDualRailCheckout, type CheckoutSelection } from "@/components/dual-rail-checkout";

/** Read-only catalog plus selectable dual-rail checkout preview; no money is accepted. */
export function LowBarrierPricing() {
  const initialPlan = GEOMACRO_SUBSCRIPTIONS[0];
  const [selection, setSelection] = useState<CheckoutSelection>({
    id: initialPlan.id,
    name: initialPlan.name,
    amountUsd: initialPlan.price_usd,
    credits: initialPlan.credits_per_30_days,
    kind: "monthly_plan",
  });
  const selectProduct = (product: CheckoutSelection) => {
    setSelection(product);
    document.getElementById("payment-checkout")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section aria-label="Monthly plans and one-time credits" data-pricing-version={GEOMACRO_LOW_BARRIER_VERSION} className="space-y-9">
      <div>
        <p className="gm-eyebrow">Monthly access</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Start small. Scale when you need to.</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Each purchase grants up to 30 days of prepaid access; manual renewal, not automatic PayPal billing.
          Credits support qualified intelligence access once checkout and API entitlements are enabled.
          No self-service charges or credit allocation are activated during the prelaunch preview.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {GEOMACRO_SUBSCRIPTIONS.map(plan => (
            <article key={plan.id} data-plan-id={plan.id} className="flex flex-col rounded-2xl border border-border p-6">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-4">
                <span className="text-3xl font-semibold">{"$"}{plan.price_usd}</span>
                <span className="text-sm text-muted-foreground"> USD / 30 days</span>
              </p>
              <p className="mt-2 font-medium">{plan.credits_per_30_days.toLocaleString("en-US")} credits / 30 days</p>
              <p className="mt-2 text-xs text-muted-foreground">{plan.audience}</p>
              <ul className="mt-4 flex-1 list-disc space-y-2 pl-4 text-sm text-muted-foreground">
                {plan.features.map(feature => <li key={feature}>{feature}</li>)}
              </ul>
              <button type="button"
                onClick={() => selectProduct({
                  id:plan.id,name:plan.name,amountUsd:plan.price_usd,
                  credits:plan.credits_per_30_days,kind:"monthly_plan",
                })}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5">
                {selection.id === plan.id ? "Selected · View payment methods" : "Select plan & payment method"}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">Live checkout locked · no charge</p>
            </article>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold tracking-tight">One-time credit packs</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          One-time credit packs do not renew automatically.
          Packs activate only after a verified payment receipt and entitlement reconciliation.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {GEOMACRO_ONE_TIME_PACKS.map(pack => (
            <article key={pack.id} data-pack-id={pack.id} className="flex flex-col rounded-xl border border-border p-5">
              <h3 className="font-semibold">{pack.name} · {"$"}{pack.price_usd} USD</h3>
              <p className="mt-2 flex-1 text-sm">{pack.credits.toLocaleString("en-US")} credits, one time</p>
              <button type="button"
                onClick={() => selectProduct({
                  id:pack.id,name:pack.name + " credit pack",amountUsd:pack.price_usd,
                  credits:pack.credits,kind:"one_time_pack",
                })}
                className="mt-4 min-h-11 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5">
                {selection.id === pack.id ? "Selected · View payment methods" : "Select pack & payment method"}
              </button>
            </article>
          ))}
        </div>
      </div>

      <LockedDualRailCheckout selection={selection} />

    </section>
  );
}
