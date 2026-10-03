import type { PublicRiskIndices } from "./risk-indices.types";
import { PUBLIC_RISK_INDICES_CONTRACT_VERSION } from "./risk-indices.types";

const EDGE_URL = "https://geomacro-risk-indices.daspallab202391.workers.dev/risk-indices";
const EDGE_AUTHORITY = "backblaze-b2-risk-indices-edge";
const PROJECT_REF = "ldpwajisioljyjtojvfx";
const METHODOLOGY = "gri-v1.2.0";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function recentEnough(value: unknown): boolean {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) && parsed <= Date.now() + 5 * 60_000 && Date.now() - parsed <= MAX_AGE_MS;
}

export function validatePublicRiskIndices(data: PublicRiskIndices | null | undefined): boolean {
  if (
    !data ||
    data.contractVersion !== PUBLIC_RISK_INDICES_CONTRACT_VERSION ||
    data.parentMethodologyVersion !== METHODOLOGY ||
    data.verificationStatus !== "verified" ||
    !Array.isArray(data.indices) ||
    data.indices.length !== 3
  ) return false;

  const expected = new Set(["geopolitics", "macro", "critical_minerals"]);
  for (const index of data.indices) {
    if (!expected.delete(index.key)) return false;
    if (
      index.status !== "available" ||
      !Number.isFinite(Number(index.score)) ||
      !Array.isArray(index.series?.["7D"]?.buckets) ||
      index.series["7D"].buckets.length < 2 ||
      !Array.isArray(index.series?.["30D"]?.buckets) ||
      index.series["30D"].buckets.length < index.series["7D"].buckets.length
    ) return false;
  }
  return expected.size === 0;
}

export async function readRiskIndicesEdge(): Promise<PublicRiskIndices | null> {
  try {
    const response = await fetch(EDGE_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4_500),
    });
    if (!response.ok || response.headers.get("x-geomacro-authority") !== EDGE_AUTHORITY) return null;

    const payload = await response.json() as {
      schema?: string;
      generated_at?: string;
      source_project?: string;
      data?: PublicRiskIndices;
    };
    if (
      payload.schema !== "geomacro.public-risk-indices-live.v1" ||
      payload.source_project !== PROJECT_REF ||
      !recentEnough(payload.generated_at) ||
      !validatePublicRiskIndices(payload.data)
    ) return null;

    return payload.data ?? null;
  } catch {
    return null;
  }
}
