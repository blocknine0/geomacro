import { GEOMACRO_CAPABILITY_PRICING_VERSION } from "@/lib/capability-pricing-catalog";
import { GEOMACRO_CREDIT_COSTS } from "@/lib/commercial-access-contract";

const CATEGORY_API_LABELS = [
  { id: "geopolitics", label: "Geopolitics", name: "GEOMACRO Geopolitics API" },
  { id: "macro_fx", label: "Macro/FX", name: "GEOMACRO Macro/FX API" },
  { id: "critical_minerals", label: "Critical Minerals", name: "GEOMACRO Critical Minerals API" },
] as const;

const VARIANTS = [
  { id: "basic_focused", label: "Focused (BASIC)" },
  { id: "standard", label: "Standard (STANDARD)" },
  { id: "complex_full", label: "Complex multi-source (COMPLEX)" },
] as const;

const RISK_GATE_PRICES = {
  basic_focused: "0.15",
  standard: "0.20",
  complex_full: "0.30",
} as const;

const CATEGORY_APIS = CATEGORY_API_LABELS;

/** Public price display only. Category aliases share the canonical query engine and payment resource. */
export function CategoryApiPricing({showPrices=false}:{showPrices?:boolean}={}) {
  return (
    <section
      aria-labelledby="category-api-pricing-title"
      data-pricing-version={GEOMACRO_CAPABILITY_PRICING_VERSION}
      className="rounded-2xl border border-border p-5 sm:p-6"
    >
      <p className="gm-eyebrow">Three category APIs</p>
      <h2 id="category-api-pricing-title" className="mt-2 text-2xl font-semibold tracking-tight">
        Three category APIs. One intelligence engine.
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
        One unified Risk Gate delivers all three categories across three evidence tiers. The listed
        USDC rates match the Predge customer schedule; checkout remains disabled until separately approved.
        There is no category surcharge.
      </p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[300px] text-left text-sm">
          <caption className="sr-only">
            Unified GEOMACRO Risk Gate pricing for Geopolitics, Macro/FX and Critical Minerals
          </caption>
          <thead className="bg-muted/40">
            <tr>
              <th scope="col" className="p-4">Category API</th>
              {showPrices && VARIANTS.map((variant) => (
                <th key={variant.id} scope="col" className="p-4">
                  {variant.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_APIS.map((api) => (
              <tr key={api.id} data-api-id={api.id} className="border-t border-border align-top">
                <th scope="row" className="p-4 font-medium">
                  <span className="block text-sm font-semibold">{api.name}</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    Official Geomacro intelligence endpoint
                  </span>
                  <code className="mt-2 block break-all text-xs font-medium text-primary">
                    geomacro.live /api/v1/risk-gate
                  </code>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    category: geopolitics | macro-fx | critical-minerals
                  </span>
                </th>
                {showPrices && VARIANTS.map((variant) => (
                  <td
                    key={variant.id}
                    data-capability="risk_gate_bundle"
                    data-variant={variant.id}
                    data-price-usdc={RISK_GATE_PRICES[variant.id]}
                    className="p-4 font-mono font-medium"
                  >
                    {RISK_GATE_PRICES[variant.id]} <span className="font-sans text-xs text-muted-foreground">USDC</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showPrices && (
        <p className="mt-4 text-sm font-medium" data-prepaid-credit-cost={GEOMACRO_CREDIT_COSTS.risk_gate_bundle}>
          Prepaid-credit Risk Gate pricing follows the account catalog. USDC per-delivery rates do not define a credit conversion.
        </p>
      )}
      <aside className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5" aria-label="Official GeoMacro commercial Risk Gate">
        <p className="text-sm font-semibold">Official GEOMACRO Commercial Risk Gate</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Ed25519-signed derived intelligence with verified commercial redistribution and AI-agent usage rights.
          Built for direct API consumers and AI agents, with Base USDC x402 and prepaid-credit options alongside enterprise
          partner access available under separate terms.
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Availability and charges remain gated by account eligibility, delivery checks, and explicit production
          billing approval.
        </p>
      </aside>
      <div className="mt-4 space-y-2 text-xs leading-5 text-muted-foreground">
        <p>
          All three categories route through the single canonical
          <span className="mx-1 font-semibold">GEOMACRO Risk Gate API</span>
          at <code>geomacro.live /api/v1/risk-gate</code>; pass the category as a request parameter.
        </p>
        <p>
          A request must pass evidence, commercial-rights, signing and delivery checks before it can become chargeable.
          Production USDC payments remain locked pending separate approval.
        </p>
      </div>
    </section>
  );
}
