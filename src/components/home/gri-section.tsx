import { RiskIndicesPreview } from "@/components/home/risk-indices-preview";
import { useRiskIndices } from "@/lib/use-risk-indices";

/**
 * Homepage risk-index surface.
 *
 * This remains the compact preview; the dedicated /global-risk route is the
 * full verification workspace. The rendered public surface uses only the
 * current three-index contract and does not make a legacy combined-GRI read.
 */
export function RiskIndicesSection() {
  const indices = useRiskIndices();
  return <RiskIndicesPreview data={indices.data} status={indices.status} />;
}
