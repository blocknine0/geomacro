import { createHash } from "node:crypto";

const stableOrder = value => createHash("sha256").update(value).digest("hex");

/** Select exactly `limit` unique live candidates from a deterministic daily rotation. */
export function select195x3LiveSample(candidates, limit, epochDay) {
  if (!Array.isArray(candidates) || candidates.length === 0) throw new Error("LIVE_CANDIDATES_REQUIRED");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > candidates.length) throw new Error("LIVE_SAMPLE_LIMIT_INVALID");
  if (!Number.isSafeInteger(epochDay) || epochDay < 0) throw new Error("LIVE_SAMPLE_DAY_INVALID");
  const ids = candidates.map(candidate => candidate?.id);
  if (ids.some(id => typeof id !== "string" || id.length === 0) || new Set(ids).size !== ids.length) {
    throw new Error("LIVE_CANDIDATE_IDS_MUST_BE_UNIQUE");
  }

  const permutation = candidates
    .map(candidate => ({ candidate, order: stableOrder(candidate.id) }))
    .sort((a, b) => a.order.localeCompare(b.order) || a.candidate.id.localeCompare(b.candidate.id));
  const start = (epochDay * limit) % permutation.length;
  return Array.from({ length: limit }, (_, offset) => permutation[(start + offset) % permutation.length].candidate);
}
