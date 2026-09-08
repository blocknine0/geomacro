import { GriPreview } from "@/components/home/gri-preview";
import type { GlobalRisk, RiskStatus } from "@/lib/use-global-risk";
import type { UserError } from "@/lib/user-errors";

/**
 * Homepage GRI surface.
 *
 * This is intentionally a compact preview. The dedicated /global-risk route is
 * the permanent full GRI workspace for history, attribution, evidence,
 * methodology and integrity proof.
 */
export function GlobalRiskIndexSection({
  risk,
  status,
  error,
}: {
  risk: GlobalRisk | null;
  status: RiskStatus;
  error: UserError | null;
  updatedAt: number | null;
  retry: () => void;
}) {
  return <GriPreview risk={risk} status={status} error={error} />;
}
