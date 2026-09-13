export const TESTNET_DATA_DELIVERY_VERSION = "testnet-data-delivery-v1.0.0" as const;

export const TESTNET_STRUCTURAL_TEST_LIMITS = {
  max_subjects_per_request: 1,
  digest_structural_observations: 3,
  profile_structural_observations: 8,
  max_evidence_references: 12,
  history_mode: "bounded_history",
  public_and_developer_same_allowance: true,
  bulk_export: false,
  execution_authorized: false,
} as const;

export const TESTNET_ASSISTANCE_BOUNDARIES = {
  purpose: "decision_support_only",
  user_or_agent_controls_action: true,
  recommendation_is_not_execution_authority: true,
  execution_authorized: false,
} as const;
