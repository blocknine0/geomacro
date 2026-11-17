export type GlobalRiskQueryCategory = "GEOPOLITICS" | "MACRO_FX" | "CRITICAL_MINERALS" | "MACRO" | "RARE_EARTH";
export const GLOBAL_RISK_QUERY_TAXONOMY_VERSION: string;
export const GLOBAL_RISK_QUERY_ROTATION_MS: number;
export const GLOBAL_RISK_QUERY_CATEGORIES: readonly ("GEOPOLITICS" | "MACRO_FX" | "CRITICAL_MINERALS")[];
export const GLOBAL_RISK_QUERY_BUCKETS: Readonly<Record<"GEOPOLITICS" | "MACRO_FX" | "CRITICAL_MINERALS", readonly {
  id: string;
  topic_tags: readonly string[];
  terms: readonly string[];
  affected_assets: readonly string[];
}[]>>;
export function selectGlobalRiskQueryBucket(category: GlobalRiskQueryCategory, now?: number, rotationIndex?: number): Readonly<{
  category: "GEOPOLITICS" | "MACRO_FX" | "CRITICAL_MINERALS";
  slot: number;
  bucket_index: number;
  bucket_id: string;
  topic_tags: readonly string[];
  terms: readonly string[];
  affected_assets: readonly string[];
}>;
