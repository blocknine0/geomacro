import { RiskIndicesPreview } from "@/components/home/risk-indices-preview";
import { useRiskIndices } from "@/lib/use-risk-indices";
import type { GlobalRisk, RiskStatus } from "@/lib/use-global-risk";
import type { UserError } from "@/lib/user-errors";

/**
 * Homepage risk-index surface.
 *
 * This remains the compact preview; the dedicated /global-risk route is the
 * full verification workspace. The prop signature stays compatible while
 * remaining callers migrate away from the legacy combined GRI hook. The
 * rendered public surface uses only the new three-index contract.
 */
export function GlobalRiskIndexSection({
  risk: _risk,
  status: _status,
  error: _error,
  updatedAt: _updatedAt,
  retry: _retry,
}: {
  risk: GlobalRisk | null;
  status: RiskStatus;
  error: UserError | null;
  updatedAt: number | null;
  retry: () => void;
}) {
  const indices = useRiskIndices();
  return <RiskIndicesPreview data={indices.data} status={indices.status} />;
}
