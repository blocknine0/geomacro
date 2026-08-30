import { supabaseFeed } from "@/lib/supabase-feed";
import { GRI_METHOD_VERSION } from "@/lib/gri-engine.js";

export type GriProofEventChange = {
  eventId: string;
  kind: "added" | "removed" | "rescored" | "reweighted" | string;
  category: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  previousSeverity: number | null;
  currentSeverity: number | null;
  previousContribution: number;
  currentContribution: number;
  deltaPoints: number;
};

export type GriProofCategoryChange = {
  category: string;
  previousScore: number | null;
  currentScore: number | null;
  previousContribution: number;
  currentContribution: number;
  deltaPoints: number;
};

export type GriProofExplanation = {
  explanationVersion?: string;
  baseline?: boolean;
  why?: {
    direction?: string;
    exactChangePoints?: number | null;
    displayChangePoints?: number | null;
    previousRawScore?: number | null;
    currentRawScore?: number | null;
    previousDisplayScore?: number | null;
    currentDisplayScore?: number | null;
    coverageDelta?: number | null;
    eventCountDelta?: number | null;
    sourceCountDelta?: number | null;
    topCategoryChanges?: GriProofCategoryChange[];
    topEventChanges?: GriProofEventChange[];
  };
  how?: {
    topCurrentCategories?: Array<{
      category: string;
      score: number;
      normalizedWeight: number;
      contributionPoints: number;
      eventCount: number;
      sourceCount: number;
    }>;
    topCurrentEvents?: Array<{
      eventId: string;
      category: string;
      sourceTitle: string | null;
      sourceUrl: string | null;
      severity: number;
      confidence: number;
      contributionPoints: number;
    }>;
  };
};

export type GriContributionProof = {
  event_id: string;
  category: string;
  source_key: string;
  source_name: string | null;
  source_domain: string | null;
  source_url: string | null;
  source_title: string | null;
  summary: string | null;
  severity: number | string;
  confidence: number | string;
  observed_at: string;
  published_at: string | null;
  age_hours: number | string;
  confidence_weight: number | string;
  decay_weight: number | string;
  raw_weight: number | string;
  effective_event_weight: number | string;
  source_effective_weight: number | string;
  category_effective_weight: number | string;
  normalized_category_weight: number | string;
  within_category_share: number | string;
  global_share: number | string;
  contribution_points: number | string;
  classification_provider: string | null;
  classification_model: string | null;
  classification_version: string | null;
  classification_prompt_version: string | null;
  classification_scored_at: string | null;
  classification_input_hash: string | null;
};

export type GriValidationMetric = {
  benchmark_key: string;
  horizon_hours: number;
  split: "all" | "train" | "test" | string;
  sample_count: number;
  pearson_r: number | string | null;
  spearman_rho: number | string | null;
  delta_pearson_r: number | string | null;
  delta_pearson_p_approx: number | string | null;
  direction_hit_rate: number | string | null;
  high_risk_event_count: number;
  false_positive_rate: number | string | null;
  event_study_high_mean_z: number | string | null;
  event_study_baseline_mean_z: number | string | null;
  event_study_effect_z: number | string | null;
  notes: string | null;
};

export type GriValidationRun = {
  id: string;
  methodology_version: string;
  validation_version: string;
  evidence_mode: "live_oos" | "retrospective_replay" | string;
  source_replay_run_id: string | null;
  status: string;
  sample_start: string | null;
  sample_end: string | null;
  sample_count: number;
  benchmark_count: number;
  train_fraction: number | string | null;
  result_hash: string | null;
  summary: Record<string, unknown> | null;
  published_at: string | null;
};

export type GriProofPackage = {
  snapshot: {
    id: string;
    as_of: string;
    methodology_version: string;
    methodology_hash: string;
    input_hash: string;
    evidence_hash: string | null;
    calculation_hash: string;
    change_hash: string | null;
    proof_version: string | null;
    proof_hash: string | null;
    verification_status: string | null;
    reconciliation_residual: number | string | null;
    change_residual: number | string | null;
    raw_score: number | string | null;
    display_score: number | null;
    coverage: number | string;
    weighted_confidence: number | string | null;
    event_count: number;
    source_count: number;
    category_breakdown: unknown;
    previous_as_of: string | null;
    previous_raw_score: number | string | null;
    previous_display_score: number | null;
    change_points: number | string | null;
    explanation: GriProofExplanation | null;
    published_at: string | null;
  };
  contributions: GriContributionProof[];
  validationRun: GriValidationRun | null;
  validationMetrics: GriValidationMetric[];
};

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadGriProofPackage(snapshotId: string): Promise<GriProofPackage> {
  const snapshotResult = await supabaseFeed
    .from("gri_snapshots")
    .select(
      "id,as_of,methodology_version,methodology_hash,input_hash,evidence_hash,calculation_hash,change_hash,proof_version,proof_hash,verification_status,reconciliation_residual,change_residual,raw_score,display_score,coverage,weighted_confidence,event_count,source_count,category_breakdown,previous_as_of,previous_raw_score,previous_display_score,change_points,explanation,published_at",
    )
    .eq("id", snapshotId)
    .eq("status", "published")
    .eq("methodology_version", GRI_METHOD_VERSION)
    .maybeSingle();
  if (snapshotResult.error) throw snapshotResult.error;
  if (!snapshotResult.data) throw new Error("Published GRI proof package not found.");

  const contributionResult = await supabaseFeed
    .from("gri_contributions")
    .select(
      "event_id,category,source_key,source_name,source_domain,source_url,source_title,summary,severity,confidence,observed_at,published_at,age_hours,confidence_weight,decay_weight,raw_weight,effective_event_weight,source_effective_weight,category_effective_weight,normalized_category_weight,within_category_share,global_share,contribution_points,classification_provider,classification_model,classification_version,classification_prompt_version,classification_scored_at,classification_input_hash",
    )
    .eq("snapshot_id", snapshotId)
    .order("contribution_points", { ascending: false });
  if (contributionResult.error) throw contributionResult.error;

  let validationRun: GriValidationRun | null = null;
  let validationMetrics: GriValidationMetric[] = [];
  const validationResult = await supabaseFeed
    .from("gri_validation_runs")
    .select(
      "id,methodology_version,validation_version,evidence_mode,source_replay_run_id,status,sample_start,sample_end,sample_count,benchmark_count,train_fraction,result_hash,summary,published_at",
    )
    .eq("methodology_version", GRI_METHOD_VERSION)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!validationResult.error && validationResult.data) {
    validationRun = validationResult.data as GriValidationRun;
    const metricsResult = await supabaseFeed
      .from("gri_validation_metrics")
      .select(
        "benchmark_key,horizon_hours,split,sample_count,pearson_r,spearman_rho,delta_pearson_r,delta_pearson_p_approx,direction_hit_rate,high_risk_event_count,false_positive_rate,event_study_high_mean_z,event_study_baseline_mean_z,event_study_effect_z,notes",
      )
      .eq("validation_run_id", validationRun.id)
      .order("benchmark_key", { ascending: true })
      .order("horizon_hours", { ascending: true });
    if (!metricsResult.error)
      validationMetrics = (metricsResult.data ?? []) as GriValidationMetric[];
  }

  return {
    snapshot: {
      ...snapshotResult.data,
      explanation:
        snapshotResult.data.explanation && typeof snapshotResult.data.explanation === "object"
          ? (snapshotResult.data.explanation as GriProofExplanation)
          : null,
    },
    contributions: (contributionResult.data ?? []) as GriContributionProof[],
    validationRun,
    validationMetrics,
  };
}
