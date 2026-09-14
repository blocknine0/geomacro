import { buildRiskGateV2ActivationPlan } from "./risk-gate-v2-context";
import type { RiskGateV2Request } from "./risk-gate-v2-contract";
import { RISK_GATE_V2_SUPPORT_READINESS } from "./risk-gate-v2-support-readiness";
import type { RiskGateV2Module } from "./risk-gate-v2-taxonomy";

export const RISK_GATE_V2_REQUEST_READINESS_VERSION =
  "risk-gate-v2-request-readiness-1.0.0" as const;

export type RiskGateV2RequestReadiness = {
  version: typeof RISK_GATE_V2_REQUEST_READINESS_VERSION;
  request_id: string;
  ready_for_supported_module_evaluation: boolean;
  fail_closed_required: boolean;
  active_modules: RiskGateV2Module[];
  supported_modules: RiskGateV2Module[];
  unsupported_modules: Array<{
    module: RiskGateV2Module;
    status: (typeof RISK_GATE_V2_SUPPORT_READINESS)[RiskGateV2Module]["status"];
    blockers: readonly string[];
    promotion_requirements: readonly string[];
  }>;
};

/**
 * Static commercial-readiness gate for a concrete Risk Gate request shape.
 *
 * This does not claim that a supported module has fresh subject data. It only
 * answers whether every module activated by the request has a production
 * methodology. Runtime data/freshness/commercial eligibility still fail closed
 * in the Risk Gate engine and module builders.
 */
export function evaluateRiskGateV2RequestReadiness(
  request: RiskGateV2Request,
): RiskGateV2RequestReadiness {
  const plan = buildRiskGateV2ActivationPlan(request);
  const supportedModules: RiskGateV2Module[] = [];
  const unsupportedModules: RiskGateV2RequestReadiness["unsupported_modules"] = [];

  for (const module of plan.active_modules) {
    const readiness = RISK_GATE_V2_SUPPORT_READINESS[module];
    if (readiness.status === "SUPPORTED") {
      supportedModules.push(module);
      continue;
    }
    unsupportedModules.push({
      module,
      status: readiness.status,
      blockers: readiness.blockers,
      promotion_requirements: readiness.promotion_requirements,
    });
  }

  return {
    version: RISK_GATE_V2_REQUEST_READINESS_VERSION,
    request_id: request.request_id,
    ready_for_supported_module_evaluation: unsupportedModules.length === 0,
    fail_closed_required: unsupportedModules.length > 0,
    active_modules: plan.active_modules,
    supported_modules: supportedModules,
    unsupported_modules: unsupportedModules,
  };
}
