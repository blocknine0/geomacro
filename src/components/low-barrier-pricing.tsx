import { useState } from "react";
import { GEOMACRO_LOW_BARRIER_VERSION } from "@/lib/low-barrier-pricing";
import { LockedDualRailCheckout, type CheckoutSelection } from "@/components/dual-rail-checkout";

const RISK_GATE_PACKS = [
  { id: "risk-gate-small", name: "Small", priceUsd: 15, credits: 1_500, basic: 100, standard: 75, complex: 50 },
  { id: "risk-gate-standard", name: "Standard", priceUsd: 30, credits: 3_000, basic: 200, standard: 150, complex: 100, popular: true },
  { id: "risk-gate-best", name: "Best", priceUsd: 60, credits: 6_000, basic: 400, standard: 300, complex: 200 },
] as const;

/** Read-only catalog plus selectable dual-rail checkout preview; no money is accepted. */
export function LowBarrierPricing() {
  const initialPack = RISK_GATE_PACKS[0];
  const [selection, setSelection] = useState<CheckoutSelection>({
    id: initialPack.id,
    name: `${initialPack.name} Risk Gate Pack`,
    amountUsd: initialPack.priceUsd,
    credits: initialPack.credits,
    kind: "monthly_plan",
  });
  const selectProduct = (product: CheckoutSelection) => {
    setSelection(product);
    document.getElementById("payment-checkout")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section aria-label="Monthly Risk Gate packs" data-pricing-version={GEOMACRO_LOW_BARRIER_VERSION} className="space-y-9">
      <div>
        <p className="gm-eyebrow">Monthly Risk Gate Packs</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Choose a balance for your Risk Gate workload.</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Each pack is a monthly purchase amount, not an expiring subscription. 1 credit = $0.01 USD;
          eligible Risk Gate deliveries cost 15 BASIC, 20 STANDARD, or 30 COMPLEX credits across all three categories.
          Recharge manually when needed; checkout and credit allocation are still locked in this prelaunch preview.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {RISK_GATE_PACKS.map(pack => (
            <article key={pack.id} data-pack-id={pack.id} className="flex flex-col rounded-2xl border border-border p-6">
              <div className="flex min-h-7 items-start justify-between gap-2">
                <h3 className="text-lg font-semibold">{pack.name}</h3>
                {"popular" in pack && pack.popular && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Most Popular</span>}
              </div>
              <p className="mt-4">
                <span className="text-3xl font-semibold">{"$"}{pack.priceUsd}</span>
                <span className="text-sm text-muted-foreground"> USD / month</span>
              </p>
              <p className="mt-2 font-medium">{pack.credits.toLocaleString("en-US")} credits</p>
              <p className="mt-2 text-xs text-muted-foreground">Up to {pack.basic} BASIC · {pack.standard} STANDARD · {pack.complex} COMPLEX calls</p>
              <ul className="mt-4 flex-1 list-disc space-y-2 pl-4 text-sm text-muted-foreground">
                <li>Unused credits never expire; your balance rolls over month to month.</li>
                <li>Same Risk Gate access for GEOPOLITICS, MACRO_FX, and CRITICAL_MINERALS.</li>
              </ul>
              <button type="button"
                onClick={() => selectProduct({
                  id:pack.id,name:`${pack.name} Risk Gate Pack`,amountUsd:pack.priceUsd,
                  credits:pack.credits,kind:"monthly_plan",
                })}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5">
                {selection.id === pack.id ? "Selected · View payment methods" : "Select pack & payment methods"}
              </button>
            </article>
          ))}
        </div>
      </div>

      <aside className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6" aria-label="Risk Gate recharge and agent fallback">
        <h3 className="text-base font-semibold">Keep your Risk Gate workflow ready</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          A low-balance top-up prompt is designed to appear below $2.00 (fewer than 10 STANDARD calls); one-click recharge
          becomes available only after checkout activation. Agent integrations can use HTTP 402 pay-per-call at $0.15 / $0.20 / $0.30
          in native USDC on Base, Polygon PoS, or Arc once those payment rails are enabled. These recharge and 402 payment
          paths are currently locked, so this preview does not promise automatic fallback or uninterrupted calls.
        </p>
      </aside>

      <LockedDualRailCheckout selection={selection} />

    </section>
  );
}
