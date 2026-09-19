import type { GlobalRisk } from "./global-risk.types";
import {
  PUBLIC_RISK_INDICES_CONTRACT_VERSION,
  type PublicRiskIndices,
} from "./risk-indices.types";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const PUBLIC_RISK_EDGE_URL =
  `https://${AUTHORITATIVE_PROJECT_REF}.supabase.co/functions/v1/public-risk-indices`;
const EDGE_TIMEOUT_MS = 5_000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validHash(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validateIndices(value: unknown): value is PublicRiskIndices {
  const row = record(value);
  if (!row) return false;
  if (row.contractVersion !== PUBLIC_RISK_INDICES_CONTRACT_VERSION) return false;
  if (row.parentMethodologyVersion !== "gri-v1.2.0") return false;
  if (row.proofVersion !== "gri-proof-v1.2.0") return false;
  if (row.proofScope !== "verified-category-projection") return false;
  if (row.verificationStatus !== "verified") return false;
  if (!validHash(row.proofHash)) return false;
  if (!validHash(row.evidenceHash)) return false;
  if (!validHash(row.calculationHash)) return false;
  if (!validHash(row.dispositionHash)) return false;
  if (!validHash(row.inputHash)) return false;
  if (!validHash(row.methodologyHash)) return false;
  if (!Array.isArray(row.indices) || row.indices.length !== 3) return false;

  const keys = row.indices.map((item) => record(item)?.key).sort();
  if (
    keys[0] !== "critical_minerals" ||
    keys[1] !== "geopolitics" ||
    keys[2] !== "macro"
  ) return false;

  return row.indices.every((item) => {
    const index = record(item);
    if (!index) return false;
    if (!["available", "unavailable"].includes(String(index.status))) return false;
    if (!["current", "last_verified"].includes(String(index.readingStatus))) return false;
    if (index.status === "available") {
      return (
        typeof index.readingSnapshotId === "string" &&
        typeof index.readingAsOf === "string" &&
        typeof index.readingAgeHours === "number" &&
        Number.isFinite(index.readingAgeHours)
      );
    }
    return (
      index.readingSnapshotId === null &&
      index.readingAsOf === null &&
      index.readingAgeHours === null
    );
  });
}

function validateLegacyGlobalRisk(value: unknown): value is GlobalRisk {
  const row = record(value);
  if (!row) return false;
  return (
    typeof row.snapshotId === "string" &&
    typeof row.score === "number" &&
    Number.isFinite(row.score) &&
    typeof row.rawScore === "number" &&
    Number.isFinite(row.rawScore) &&
    row.methodologyVersion === "gri-v1.2.0" &&
    row.proofVersion === "gri-proof-v1.2.0" &&
    row.verificationStatus === "verified" &&
    validHash(row.proofHash) &&
    validHash(row.evidenceHash) &&
    validHash(row.calculationHash) &&
    validHash(row.dispositionHash) &&
    validHash(row.inputHash) &&
    validHash(row.methodologyHash) &&
    Array.isArray(row.drivers) &&
    Array.isArray(row.recentEvents) &&
    Boolean(record(row.series))
  );
}

type EdgePayload = {
  ok: true;
  data: PublicRiskIndices;
  legacyGlobalRisk: GlobalRisk;
};

async function fetchEdgePayload(): Promise<EdgePayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);

  try {
    const response = await fetch(PUBLIC_RISK_EDGE_URL, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Authoritative public risk edge returned HTTP ${response.status}`);
    }

    const parsed = (await response.json()) as unknown;
    const body = record(parsed);
    if (!body || body.ok !== true) {
      throw new Error("Authoritative public risk edge returned an unavailable payload");
    }
    if (!validateIndices(body.data)) {
      throw new Error("Authoritative public risk edge returned an invalid index contract");
    }
    if (!validateLegacyGlobalRisk(body.legacyGlobalRisk)) {
      throw new Error("Authoritative public risk edge returned an invalid compatibility contract");
    }

    return {
      ok: true,
      data: body.data,
      legacyGlobalRisk: body.legacyGlobalRisk,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function readPublicRiskIndicesFromEdge(): Promise<PublicRiskIndices> {
  return (await fetchEdgePayload()).data;
}

export async function readPublicGlobalRiskFromEdge(): Promise<GlobalRisk> {
  return (await fetchEdgePayload()).legacyGlobalRisk;
}
