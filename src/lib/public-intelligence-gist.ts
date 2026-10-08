import type { PublicIntelligenceRow } from "./public-intelligence.functions";

const SCORED_PREFIX = "Geomacro finds ";
const OBSERVED_PREFIX = "Geomacro observes ";
const PUBLIC_DOMAINS = new Set(["geopolitics", "macro", "rare_earth"]);
const EDITORIAL_LABEL = /\b(?:articles?|pieces?)\b/iu;
const SOURCE_MARKUP = /(?:https?:\/\/|www\.|<[^>]*>|\[(?:source|publisher|provider)\])/iu;

function singleLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/gu, " ").trim();
  if (
    text.length < 8 || text.length > maxLength ||
    EDITORIAL_LABEL.test(text) || SOURCE_MARKUP.test(text)
  ) return null;
  return text;
}

function eventTime(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/**
 * A one-line Geomacro-derived intelligence gist. Never copy an upstream
 * headline or narrative without the approved canonical classifier prefix.
 * Prefer the *already derived* canonical short summary to a verbose
 * classification rationale. No AI inference or new risk claim happens here.
 */
export function derivedPublicGist(
  title: unknown,
  summary: unknown,
  status: "verified_b2" | "live_observed",
): string | null {
  const prefix = status === "live_observed" ? OBSERVED_PREFIX : SCORED_PREFIX;
  if (typeof title !== "string" || !title.trim().startsWith(prefix)) return null;
  const canonical = singleLine(title.trim().slice(prefix.length), 280);
  const approvedSummary = singleLine(summary, 190);
  const gist = status === "verified_b2"
    ? approvedSummary ?? (canonical && canonical.length <= 190 ? canonical : null)
    : canonical && canonical.length <= 190 ? canonical : null;
  if (!gist) return null;
  const trimmed = gist.replace(/[.!?]+$/u, "").trim();
  if (trimmed.length < 8) return null;
  return `${prefix}${trimmed}`;
}

/**
 * Only explicitly approved fields can reach the public browser/server output.
 * In particular, never spread a stored B2 row into the JSON response.
 */
export function sanitizePublicIntelligenceRow(
  input: PublicIntelligenceRow,
): PublicIntelligenceRow | null {
  if (!input || typeof input !== "object") return null;
  const category = String(input.category ?? "").trim().toLowerCase();
  if (!PUBLIC_DOMAINS.has(category) ||
      typeof input.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/u.test(input.id) ||
      !eventTime(input.created_at) ||
      (input.published_at != null && !eventTime(input.published_at))) return null;

  const observed = input.public_status === "live_observed";
  const status = observed ? "live_observed" as const : "verified_b2" as const;
  const headline = derivedPublicGist(input.source_title, input.summary, status);
  if (!headline) return null;

  const severity = input.severity;
  if (observed) {
    if (category !== "geopolitics" || severity !== null || input.delta !== null) return null;
  } else if (typeof severity !== "number" || !Number.isFinite(severity) ||
             severity < 0 || severity > 100) return null;

  const delta = input.delta === null || input.delta === undefined ? null :
    typeof input.delta === "number" && Number.isFinite(input.delta) ? input.delta : null;
  const summary = singleLine(input.summary, 190);

  return {
    id: input.id,
    source_title: headline,
    summary: observed ? null : summary,
    category,
    severity: observed ? null : severity,
    delta: observed ? null : delta,
    created_at: input.created_at,
    published_at: input.published_at ?? null,
    public_status: status,
  };
}
