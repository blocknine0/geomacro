import {
  GEOMACRO_CAPABILITY_PRICES,
  GEOMACRO_CAPABILITY_PRICING_VERSION,
} from "@/lib/capability-pricing-catalog";
import { GEOMACRO_OFFICIAL_API_CATALOG } from "@/lib/geomacro-official-api-branding";

const CATEGORY_API_LABELS = [
  { id: "geopolitics", label: "Geopolitics" },
  { id: "macro_fx", label: "Macro / FX" },
  { id: "critical_minerals", label: "Critical Minerals / Rare Earths" },
] as const;

const VARIANTS = [
  { id: "focused", label: "Focused" },
  { id: "standard", label: "Standard" },
  { id: "complex_multi_source", label: "Complex multi-source" },
] as const;

const CATEGORY_APIS = CATEGORY_API_LABELS.map((category) => {
  const api = GEOMACRO_OFFICIAL_API_CATALOG.find((candidate) => candidate.id === category.id);
  if (!api) throw new Error(`Missing canonical Geomacro category API: ${category.id}`);
  return { ...category, ...api };
});

/** Public price display only. Category aliases share the canonical query engine and payment resource. */
export function CategoryApiPricing({showPrices=false}:{showPrices?:boolean}={}) {
  const prices = GEOMACRO_CAPABILITY_PRICES.intelligence_query;
  return (
    <section
      aria-labelledby="category-api-pricing-title"
      data-pricing-version={GEOMACRO_CAPABILITY_PRICING_VERSION}
      className="rounded-2xl border border-border p-5 sm:p-6"
    >
      <p className="gm-eyebrow">Three category APIs</p>
      <h2 id="category-api-pricing-title" className="mt-2 text-2xl font-semibold tracking-tight">
        One price schedule across all three APIs.
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
        Each category uses the same canonical intelligence engine. Pricing follows the verified
        query complexity, not the category. There is no category surcharge.
      </p>
      {!showPrices && <a href="#product-catalog" className="gm-text-link mt-4">See the single price schedule below</a>}
      <div className="mt-5 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[300px] text-left text-sm">
          <caption className="sr-only">
            Canonical endpoints for Geopolitics, Macro / FX and Critical Minerals APIs
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
                  <span className="block">{api.label}</span>
                  <code className="mt-2 block break-all text-xs font-normal text-muted-foreground">
                    {api.method} {api.path}
                  </code>
                </th>
                {showPrices && VARIANTS.map((variant) => (
                  <td
                    key={variant.id}
                    data-capability="intelligence_query"
                    data-variant={variant.id}
                    data-price-usdc={prices[variant.id]}
                    className="p-4 font-mono font-medium"
                  >
                    {prices[variant.id]} <span className="font-sans text-xs text-muted-foreground">USDC</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-2 text-xs leading-5 text-muted-foreground">
        <p>
          All three category endpoints are aliases of the canonical payment resource
          <code className="mx-1">POST /api/v1/intelligence/query</code>; they are not three separate
          merchant resources or separate charges.
        </p>
        <p>
          These are published catalog prices, not payment offers. An exact request must pass live
          evidence, commercial-rights, signing and delivery checks before it can become chargeable.
          Production USDC payments remain locked pending separate approval.
        </p>
      </div>
    </section>
  );
}
