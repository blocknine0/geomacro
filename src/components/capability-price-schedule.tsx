import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import {
  GEOMACRO_CAPABILITY_PRICES,
  GEOMACRO_PUBLIC_PRICING_GROUPS,
  GEOMACRO_CAPABILITY_PRICING_VERSION,
  type PricedCapability,
} from "@/lib/capability-pricing-catalog";

const PRODUCTS: Record<
  PricedCapability,
  { title: string; description: string; includes: string[]; pilot?: boolean }
> = {
  gri_read: {
    title: "Global Risk Index",
    description: "Read a verified snapshot or understand what moved it.",
    includes: [
      "Verified index snapshot",
      "Change attribution with the attribution variant",
      "Timestamp and methodology version",
    ],
  },
  structural_country_digest: {
    title: "Country digest",
    description: "A concise structural view of one country.",
    includes: [
      "Country context and key developments",
      "Relevant structural drivers",
      "Evidence dates and coverage limits",
    ],
  },
  structural_corridor_digest: {
    title: "Corridor digest",
    description: "Review the relationship between two country endpoints.",
    includes: [
      "Directional endpoint context",
      "Cross-border structural drivers",
      "Coverage limits; physical routes are not modeled",
    ],
  },
  structural_country_profile: {
    title: "Country profile",
    description: "Go deeper into a country's structural exposure.",
    includes: [
      "Expanded country assessment",
      "Structural drivers and supporting context",
      "Evidence dates and stated limitations",
    ],
  },
  structural_corridor_profile: {
    title: "Corridor profile",
    description: "An expanded view of two connected country endpoints.",
    includes: [
      "Expanded directional endpoint assessment",
      "Country dependencies and structural context",
      "Coverage limits; physical routes are not modeled",
    ],
  },
  intelligence_query: {
    title: "Intelligence query",
    description: "Ask a focused question or explore a wider development.",
    includes: [
      "A structured answer to your question",
      "What changed and why it matters",
      "Confidence, evidence dates and limitations",
    ],
  },
  signed_risk_object: {
    title: "Signed Risk Object",
    description: "Verifiable country or directional-corridor risk context.",
    includes: [
      "A signed Geomacro Risk Object",
      "Drivers, confidence and expiry",
      "Integrity and issuer-verification fields",
    ],
    pilot: true,
  },
  risk_gate_bundle: {
    title: "Risk Gate bundle",
    description: "Risk context for a customer-controlled preflight decision.",
    includes: [
      "Bounded advisory result",
      "Signed Risk Object included once",
      "Customer retains control of every action",
    ],
    pilot: true,
  },
};
const VARIANTS: Record<string, string> = {
  verified_cached: "Verified snapshot",
  verified_change_attribution: "With change attribution",
  standard: "Standard",
  focused: "Focused",
  complex_multi_source: "Complex · multiple sources",
  existing_valid_signed: "Existing valid object",
  newly_qualified_signed: "Newly qualified object",
  existing_proof_preflight: "Existing proof preflight",
};

/** Display the canonical catalog; a catalog view never starts a payment. */
export function CapabilityPriceSchedule({ compact = false }: { compact?: boolean }) {
  const showPrices = !compact;
  const [group, setGroup] = useState("All products");
  const groups = GEOMACRO_PUBLIC_PRICING_GROUPS;
  const ids = groups
    .filter((g) => group === "All products" || group === g.label)
    .flatMap((g) => [...g.ids]);
  return (
    <section aria-label={showPrices ? "Exact USDC price by capability" : "API product outputs"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          {compact ? "Product catalog" : "Find your intelligence"}
        </h2>
        <span className="text-xs text-muted-foreground">{showPrices ? "USDC · per eligible delivery" : "Structured JSON outputs"}</span>
      </div>
      {!compact && (
      <div role="group" aria-label="Filter store products" className="mt-5 flex flex-wrap gap-2">
        {["All products", ...groups.map((g) => g.label)].map((label) => (
          <button
            key={label}
            type="button"
            aria-pressed={group === label}
            onClick={() => setGroup(label)}
            className={
              "min-h-10 rounded-full border px-4 py-2 text-xs transition " +
              (group === label
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50")
            }
          >
            {label}
          </button>
        ))}
      </div>
      )}
      {!showPrices && <a href="/pricing#product-catalog" className="gm-text-link mt-4">Compare prices in the Store <ArrowUpRight className="h-4 w-4" /></a>}
      <div
        className={
          compact
            ? "mt-6 grid gap-4 md:grid-cols-2"
            : "mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        }
      >
        {ids.map((capability) => {
          const product = PRODUCTS[capability];
          return (
            <article
              key={capability}
              data-capability={capability}
              className="flex min-w-0 flex-col rounded-2xl border border-border bg-card/40 p-6 transition hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="gm-eyebrow text-[10px]">
                  {product.pilot ? "Private pilot" : "Structured intelligence"}
                </p>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
              <h3 className="mt-5 text-xl font-semibold">{product.title}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
                {product.description}
              </p>
              {showPrices && <dl className="mt-5 divide-y divide-border border-y border-border">
                {Object.entries(GEOMACRO_CAPABILITY_PRICES[capability]).map(([variant, amount]) => (
                  <div
                    key={variant}
                    data-variant={variant}
                    data-price-usdc={amount}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <dt className="text-xs text-muted-foreground">
                      {VARIANTS[variant] ?? variant.replaceAll("_", " ")}
                    </dt>
                    <dd className="font-mono text-lg font-medium">
                      {amount} <span className="text-[10px] text-muted-foreground">USDC</span>
                    </dd>
                  </div>
                ))}
              </dl>}
              {compact ? (
                <div className="mt-5">
                  <p className="text-sm font-medium">What you receive</p>
                  <ul className="mt-3 space-y-2">
                    {product.includes.map((item) => (
                      <li key={item} className="flex gap-2 text-xs leading-5 text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
              <details className="mt-5">
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  What you receive
                </summary>
                <ul className="mt-4 space-y-3">
                  {product.includes.map((item) => (
                    <li key={item} className="flex gap-2 text-xs leading-5 text-muted-foreground">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </details>
              )}
              <div className="mt-auto pt-6">
                <a
                  href={`mailto:contact@geomacro.live?subject=${encodeURIComponent(`Geomacro launch access: ${product.title}`)}`}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition hover:border-primary hover:text-primary"
                >
                  Enquire about this product <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  {product.pilot
                    ? "Pilot access by agreement"
                    : "Self-service checkout coming soon"}
                </p>
              </div>
            </article>
          );
        })}
      </div>
      {!compact && (
      <details className="mt-6 border-t border-border pt-5">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Delivery & pricing details
        </summary>
        <p className="mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">
          {[
            `Prices come from ${GEOMACRO_CAPABILITY_PRICING_VERSION}.`,
            "A displayed price is not an available payment quote.",
            "Each exact request must qualify before payment.",
            "Unavailable, stale or unqualified results are not chargeable.",
            "Risk Gate bundles include their signed Risk Object without a second object charge.",
            "All products deliver Geomacro-derived intelligence; raw source feeds are excluded.",
          ].join(" ")}
        </p>
      </details>
      )}
    </section>
  );
}
