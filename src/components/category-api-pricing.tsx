import {
  GEOMACRO_CAPABILITY_PRICES,
  GEOMACRO_CAPABILITY_PRICING_VERSION,
} from "@/lib/capability-pricing-catalog";
import { GEOMACRO_OFFICIAL_API_CATALOG } from "@/lib/geomacro-official-api-branding";
import { GEOMACRO_RISK_GATE_CREDIT_COSTS } from "@/lib/credit-metering-policy.mjs";

const CATEGORY_API_LABELS = [
  { id: "geopolitics", name: "GEOMACRO Geopolitics API", category: "geopolitics" },
  { id: "macro_fx", name: "GEOMACRO Macro/FX API", category: "macro-fx" },
  { id: "critical_minerals", name: "GEOMACRO Critical Minerals API", category: "critical-minerals" },
] as const;

const VARIANTS = [
  { id: "existing_proof_preflight", label: "Focused (BASIC)", tier: "basic_focused" },
  { id: "standard", label: "Standard (STANDARD)", tier: "standard" },
  { id: "complex_multi_source", label: "Complex multi-source (COMPLEX)", tier: "complex_full" },
] as const;

const RISK_GATE_API_PATH: string = GEOMACRO_OFFICIAL_API_CATALOG.find(
  (candidate) => candidate.id === "risk_gate",
)?.path ?? (() => { throw new Error("Missing canonical Geomacro Risk Gate API"); })();

/** Public price display only. Category aliases share the canonical query engine and payment resource. */
export function CategoryApiPricing({showPrices=false}:{showPrices?:boolean}={}) {
  const prices = GEOMACRO_CAPABILITY_PRICES.risk_gate_bundle;
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
        One canonical Risk Gate endpoint serves all three categories. Select the evidence tier and pass
        <code className="mx-1">category</code> and <code>country_iso3</code> in the request. The credit equivalents use
        the published conversion of 1 credit = $0.01 USD; payments remain locked in this preview.
      </p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[300px] text-left text-sm">
          <caption className="sr-only">
            Official GeoMacro commercial Risk Gate pricing by category and evidence tier
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
            {CATEGORY_API_LABELS.map((api) => (
              <tr key={api.id} data-api-id={api.id} data-risk-gate-category={api.category} className="border-t border-border align-top">
                <th scope="row" className="p-4 font-medium">
                  <span className="block text-sm font-semibold">{api.name}</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    Official commercial Risk Gate · category: {api.category}
                  </span>
                  <code className="mt-2 block break-all text-xs font-medium text-primary">
                    geomacro.live {RISK_GATE_API_PATH}
                  </code>
                </th>
                {showPrices && VARIANTS.map((variant) => (
                  <td
                    key={variant.id}
                    data-capability="risk_gate_bundle"
                    data-variant={variant.id}
                    data-price-usdc={prices[variant.id]}
                    data-credit-equivalent={GEOMACRO_RISK_GATE_CREDIT_COSTS[variant.tier]}
                    className="p-4 font-mono font-medium"
                  >
                    <span className="block">{prices[variant.id]} <span className="font-sans text-xs text-muted-foreground">USDC</span></span>
                    <span className="mt-1 block font-sans text-xs text-muted-foreground">{GEOMACRO_RISK_GATE_CREDIT_COSTS[variant.tier]} credits</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showPrices && (
        <p className="mt-4 text-sm font-medium" data-prepaid-credit-costs="15,20,30">
          Tier-weighted credit equivalents: Focused (BASIC) 15 credits ($0.15), Standard 20 credits ($0.20),
          Complex multi-source (COMPLEX) 30 credits ($0.30). 1 credit = $0.01 USD.
        </p>
      )}
      <div className="mt-4 space-y-2 text-xs leading-5 text-muted-foreground">
        <p>
          All categories use one canonical endpoint: <code>geomacro.live /api/v1/risk-gate</code>.
          Pass <code>category: geopolitics | macro-fx | critical-minerals</code> and <code>country_iso3</code>
          in the JSON request, alongside the selected tier.
        </p>
        <p>
          Direct API and AI-agent consumers receive derived intelligence with Ed25519-signed GRO provenance
          and verified commercial redistribution rights. Every delivery remains subject to evidence, rights,
          signature and entitlement checks; payment activation remains separately gated.
        </p>
        <p>There is no category surcharge. The same tier price applies across all three categories.</p>
      </div>
      <aside className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5" aria-label="Official GeoMacro commercial Risk Gate">
        <p className="text-sm font-semibold">Official GEOMACRO Commercial Risk Gate</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Cryptographically signed, derived Risk Gate intelligence with Ed25519 GRO provenance and verified
          commercial redistribution and AI-agent usage rights. Built for direct API consumers, AI agents,
          and enterprise partner access. Base USDC x402 and prepaid-credit access are shown as locked previews;
          no payment or credit debit is activated here.
        </p>
      </aside>
    </section>
  );
}
