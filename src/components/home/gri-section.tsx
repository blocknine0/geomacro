import { RiskIndicesPreview } from "@/components/home/risk-indices-preview";

/**
 * Lightweight homepage introduction to the three public Risk Indices.
 *
 * Live scores, history, evidence counts and integrity details belong on the
 * dedicated /global-risk workspace so the homepage stays commercially clear.
 */
export function RiskIndicesSection() {
  return <RiskIndicesPreview />;
}
