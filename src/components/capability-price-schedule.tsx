import {GEOMACRO_CAPABILITY_PRICES,GEOMACRO_PRICING_GROUPS,
  GEOMACRO_CAPABILITY_PRICING_VERSION} from "@/lib/capability-pricing-catalog";

/** Browser-safe public presentation: no copy of prices or product eligibility. */
export function CapabilityPriceSchedule({compact=false}:{compact?:boolean}){
  return (
    <section aria-label="Exact USDC price by capability" className="rounded-2xl border border-border/65 bg-background/35 p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Exact capability prices</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Approved USDC prices. Each capability needs its own verified delivery; structural digests do not require a signed risk score.
          </p>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {GEOMACRO_CAPABILITY_PRICING_VERSION}
        </span>
      </div>
      <div className={compact?"mt-6 grid gap-4 md:grid-cols-2":"mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
        {GEOMACRO_PRICING_GROUPS.map(group=>(
          <div key={group.label} className="rounded-xl border border-border/60 bg-card/35 p-4">
            <h4 className="text-sm font-semibold">{group.label}</h4>
            <ul className="mt-3 space-y-3">
              {group.ids.map(capability=>(
                <li key={capability} data-capability={capability}>
                  <p className="font-mono text-[11px] text-foreground">
                    {capability}
                  </p>
                  {Object.entries(GEOMACRO_CAPABILITY_PRICES[capability]).map(([variant,amount])=>(
                    <div key={variant} data-variant={variant} data-price-usdc={amount} className="mt-1 flex items-center justify-between gap-3 text-xs">
                      <span className="capitalize text-muted-foreground">{variant.replaceAll("_"," ")}</span>
                      <span className="shrink-0 font-mono text-foreground">{amount} USDC</span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs leading-6 text-muted-foreground">
        Risk Gate bundles include their signed Risk Object without a second object charge.
        Unavailable, expired or unqualified results are not chargeable. Every quote is verified
        against the exact capability, variant and customer request before payment.
      </p>
    </section>
  );
}
