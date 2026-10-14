import { GEOMACRO_PRICING_GROUPS, GEOMACRO_CAPABILITY_PRICES, resolveGeomacroCapabilityPrice } from "@/lib/capability-pricing-catalog";

/** The public website reads the exact same immutable prices as machine discovery.
 * A published price is not an availability or payment authorization claim.
 */
export function CapabilityPricingTable() {
  return (
    <div aria-label="Founder-approved x402 capability prices" className="mt-10">
      <div className="mb-5">
        <h3 className="text-xl font-semibold">Exact capability prices</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Prices are in USDC per successfully delivered capability. Actual availability, source rights,
          signing and exact quote are verified before payment. No automatic tier upgrade or surcharge.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GEOMACRO_PRICING_GROUPS.map((group) => (
          <section key={group.label} className="rounded-xl border border-border/65 bg-background/40 p-5">
            <h4 className="font-semibold">{group.label}</h4>
            {group.ids.map((capability) => (
              <div key={capability} className="mt-4">
                <p className="break-all font-mono text-xs text-muted-foreground">{capability}</p>
                <dl className="mt-2 space-y-2">
                  {Object.keys(GEOMACRO_CAPABILITY_PRICES[capability]).map((variant) => {
                    const price = resolveGeomacroCapabilityPrice(capability, variant);
                    return (
                      <div key={variant} className="flex items-start justify-between gap-3 text-sm">
                        <dt className="min-w-0 text-muted-foreground">{variant.replaceAll("_", " ")}</dt>
                        <dd className="shrink-0 font-semibold tabular-nums">{price.amount_usdc} USDC</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Risk Gate bundle prices include the signed risk object; it is never billed a second time.
        Internal credits are not USDC. Unavailable or unverified capabilities cannot be charged.
      </p>
    </div>
  );
}
