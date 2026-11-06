import type { PublicRiskIndices } from "./risk-indices.types";
import { PUBLIC_RISK_INDICES_CONTRACT_VERSION } from "./risk-indices.types";

const EDGE_URL = "https://geomacro-risk-indices.daspallab202391.workers.dev/risk-indices";
const EDGE_AUTHORITY = "backblaze-b2-risk-indices-edge";
const PROJECT_REF = "ldpwajisioljyjtojvfx";
const METHODOLOGY = "gri-v1.2.0";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
type IndexReadMode = "current" | "historical";

function sourceClock(value: unknown, now: number): number | null {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) && parsed <= now + 5 * 60_000 ? parsed : null;
}
function recentEnough(value: unknown): boolean {
  const now = Date.now();
  const parsed = sourceClock(value, now);
  return parsed !== null && now - parsed <= MAX_AGE_MS;
}
/**
 * Historical recovery is separate from the CURRENT public API. It retains the
 * exact verified bytes and original source dates. It MUST NOT retimestamp,
 * upgrade signed-review status, synthesize scores, or authorize paid output.
 * A verified archived reading may be old: the UI labels it explicitly.
 */
export function validateHistoricalRiskIndices(data: PublicRiskIndices | null | undefined,
  generatedAt: unknown, now = Date.now()): boolean {
  if (!validatePublicRiskIndices(data) || !data) return false;
  const generated = sourceClock(generatedAt, now);
  const snapshot = sourceClock(data.snapshotAsOf, now);
  if (generated === null || snapshot === null || generated + 5 * 60_000 < snapshot) return false;
  if (!/^[a-f0-9]{64}$/u.test(data.proofHash ?? "") ||
      !/^[a-f0-9]{64}$/u.test(data.calculationHash ?? "") ||
      !/^[a-f0-9]{64}$/u.test(data.inputHash ?? "")) return false;
  return data.indices.every(index => {
    const reading = sourceClock(index.readingAsOf, now);
    return reading !== null &&
      reading <= generated + 5 * 60_000 &&
      (index.readingStatus === "current" || index.readingStatus === "last_verified") &&
      index.score !== null && Number.isFinite(index.score) &&
      index.score >= 0 && index.score <= 100;
  });
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

export async function readRiskIndicesEdge(mode: IndexReadMode = "current"): Promise<PublicRiskIndices | null> {
  try {
    const endpoint=mode==="historical"?EDGE_URL+"/history":EDGE_URL;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4_500),
    });
    if (!response.ok || response.headers.get("x-geomacro-authority") !== EDGE_AUTHORITY) return null;
    if (mode === "historical" &&
        (response.headers.get("x-geomacro-display-status") !== "last_verified" ||
         !["deployment-b2-readback-verified",
           "b2-exact-compressed-hash-readback-proof"].includes(
             response.headers.get("x-geomacro-historical-verification") ?? "")))
      return null;

    const payload = await response.json() as {
      schema?: string;
      generated_at?: string;
      source_project?: string;
      data?: PublicRiskIndices;
    };
    if (
      payload.schema !== "geomacro.public-risk-indices-live.v1" ||
      payload.source_project !== PROJECT_REF ||
      (mode === "current" && !recentEnough(payload.generated_at)) ||
      (mode === "historical"
        ? !validateHistoricalRiskIndices(payload.data, payload.generated_at)
        : !validatePublicRiskIndices(payload.data))
    ) return null;

    return payload.data ?? null;
  } catch {
    return null;
  }
}
