import { useState } from "react";
const RISK_GATE_CATEGORIES = [
  { value: "GEOPOLITICS", label: "Geopolitics" },
  { value: "MACRO_FX", label: "Macro / FX" },
  { value: "CRITICAL_MINERALS", label: "Critical Minerals" },
] as const;
const RISK_GATE_TIERS = [
  { value: "BASIC", label: "Focused · BASIC · 0.15 USDC / 15 credits" },
  { value: "STANDARD", label: "Standard · 0.20 USDC / 20 credits" },
  { value: "COMPLEX", label: "Complex multi-source · 0.30 USDC / 30 credits" },
] as const;
/** The checker returns readiness metadata, never the paid customer payload. */
export function StructuredProductSetup() {
  const [riskGateCategory, setRiskGateCategory] = useState<(typeof RISK_GATE_CATEGORIES)[number]["value"]>("GEOPOLITICS");
  const [riskGateCountry, setRiskGateCountry] = useState("IND");
  const [riskGateTier, setRiskGateTier] = useState<(typeof RISK_GATE_TIERS)[number]["value"]>("BASIC");
  const [riskGateResult, setRiskGateResult] = useState<string | null>(null);
  const riskGateRequest = {
    mode: "prepare",
    country_iso3: riskGateCountry.trim().toUpperCase(),
    category: riskGateCategory,
    tier: riskGateTier,
  };
  async function checkRiskGatePreparation() {
    setRiskGateResult(null);
    if (!/^[A-Z]{3}$/.test(riskGateRequest.country_iso3)) {
      setRiskGateResult("Enter a valid three-letter country ISO3 code.");
      return;
    }
    setRiskGateBusy(true);
    try {
      const response = await fetch("/api/v1/risk-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(riskGateRequest),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await response.json();
      setRiskGateResult(JSON.stringify(data, null, 2));
    } catch {
      setRiskGateResult("Preparation check could not complete. No charge was made.");
    } finally {
      setRiskGateBusy(false);
    }
  }
  const [riskGateBusy, setRiskGateBusy] = useState(false);
  return (
    <section
      className="mt-10 rounded-2xl border border-border p-6"
      aria-label="Risk Gate request preparation"
    >
      <h2 className="text-xl font-semibold">Prepare a Risk Gate request</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose a Risk Gate category, country, and evidence tier. This no-charge check validates the request shape only.
      </p>
      <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
        <h3 className="font-semibold">Unified Risk Gate request · no charge</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Prepare a direct request for any category and country. This checks the request shape only;
          it does not read evidence, create a Risk Gate, issue a quote or authorize payment.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium" htmlFor="risk-gate-category">
            Category
            <select id="risk-gate-category" value={riskGateCategory}
              onChange={event => setRiskGateCategory(event.target.value as typeof riskGateCategory)}
              className="mt-2 w-full rounded-lg border border-border bg-background p-3">
              {RISK_GATE_CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium" htmlFor="risk-gate-country">
            Country ISO3
            <input id="risk-gate-country" value={riskGateCountry} maxLength={3} autoCapitalize="characters"
              onChange={event => setRiskGateCountry(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
              className="mt-2 w-full rounded-lg border border-border bg-background p-3 font-mono" />
          </label>
          <label className="block text-sm font-medium" htmlFor="risk-gate-tier">
            Evidence tier
            <select id="risk-gate-tier" value={riskGateTier}
              onChange={event => setRiskGateTier(event.target.value as typeof riskGateTier)}
              className="mt-2 w-full rounded-lg border border-border bg-background p-3">
              {RISK_GATE_TIERS.map(tier => <option key={tier.value} value={tier.value}>{tier.label}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-4 text-sm font-medium">Request JSON · POST geomacro.live /api/v1/risk-gate</p>
        <pre data-risk-gate-request-preview className="mt-2 overflow-x-auto rounded-lg bg-background p-4 text-xs leading-5"><code>{JSON.stringify(riskGateRequest, null, 2)}</code></pre>
        <button type="button" disabled={riskGateBusy} onClick={checkRiskGatePreparation}
          className="mt-3 min-h-11 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">
          {riskGateBusy ? "Checking request shape…" : "Check preparation · no charge"}
        </button>
        <div aria-live="polite">{riskGateResult && <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-4 text-xs">{riskGateResult}</pre>}</div>
      </div>
    </section>
  );
}
