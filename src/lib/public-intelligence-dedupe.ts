export type PublicIntelligenceDedupeRow = {
  category?: string | null;
  source_title?: string | null;
  summary?: string | null;
  public_status?: string | null;
  published_at?: string | null;
  created_at?: string | null;
};

const DUPLICATE_WINDOW_MS = 72 * 60 * 60 * 1000;
const TITLE_PREFIX = /^Geomacro\s+(?:finds|observes)\s+/iu;
const TOKEN_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "onto", "over", "under",
  "after", "before", "amid", "among", "this", "that", "these", "those",
  "its", "their", "his", "her", "our", "your", "was", "were", "are",
  "has", "have", "had", "will", "would", "could", "should", "about",
  "through", "across", "within", "without", "more", "less", "new",
]);

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(TITLE_PREFIX, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokens(value: unknown): Set<string> {
  const out = new Set<string>();
  for (const token of normalizeText(value).split(" ")) {
    if (token.length < 3 || TOKEN_STOPWORDS.has(token)) continue;
    out.add(token);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return { jaccard: 0, containment: 0, minSize: 0 };
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  const minSize = Math.min(a.size, b.size);
  return {
    jaccard: union > 0 ? intersection / union : 0,
    containment: minSize > 0 ? intersection / minSize : 0,
    minSize,
  };
}

/**
 * Public payloads intentionally omit private source identity and the signed
 * same-event claim key. Text overlap alone is NOT enough to infer a matching
 * event: named actors, places, numbers and opposing actions must agree.
 * If they differ, keep both stories rather than erase an independent event.
 */
function namedAnchors(title: unknown): Set<string> {
  const cleaned = String(title ?? "").replace(TITLE_PREFIX, "");
  const matches = cleaned.match(/\b(?:[A-Z][a-z]{2,}|[A-Z]{2,})\b/gu) ?? [];
  const ignores = new Set(["The", "This", "That", "After", "Before", "New", "While"]);
  return new Set(matches.filter(x => !ignores.has(x)).map(x => x.toLowerCase()));
}

function digitAnchors(title: unknown): Set<string> {
  return new Set((normalizeText(title).match(/\b\d+(?:\.\d+)?\b/gu) ?? []));
}

function setsMatch(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every(x => b.has(x));
}

const OPPOSING_CLAIMS: ReadonlyArray<readonly [string, string]> = [
  ["approves", "rejects"], ["approved", "rejected"],
  ["raises", "cuts"], ["increases", "decreases"],
  ["imposes", "lifts"], ["introduces", "withdraws"],
  ["confirms", "denies"], ["signs", "cancels"],
  ["expands", "reduces"], ["opens", "closes"],
];

function claimsContradict(a: unknown, b: unknown): boolean {
  const x = tokens(a), y = tokens(b);
  return OPPOSING_CLAIMS.some(([pos, neg]) =>
    (x.has(pos) && y.has(neg)) || (x.has(neg) && y.has(pos)));
}

function titleIdentityCompatible(a: unknown, b: unknown): boolean {
  const namesA = namedAnchors(a), namesB = namedAnchors(b);
  if (namesA.size > 0 && namesB.size > 0 && !setsMatch(namesA, namesB)) return false;
  const digitsA = digitAnchors(a), digitsB = digitAnchors(b);
  if (!setsMatch(digitsA, digitsB)) return false;
  return !claimsContradict(a, b);
}

function rowTime(row: PublicIntelligenceDedupeRow): number {
  const published = Date.parse(String(row.published_at ?? ""));
  if (Number.isFinite(published)) return published;
  const created = Date.parse(String(row.created_at ?? ""));
  return Number.isFinite(created) ? created : -Infinity;
}

function sameStory(a: PublicIntelligenceDedupeRow, b: PublicIntelligenceDedupeRow): boolean {
  const categoryA = String(a.category ?? "").trim().toLowerCase();
  const categoryB = String(b.category ?? "").trim().toLowerCase();
  if (!categoryA || categoryA !== categoryB) return false;

  const timeA = rowTime(a);
  const timeB = rowTime(b);
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB) || Math.abs(timeA - timeB) > DUPLICATE_WINDOW_MS) {
    return false;
  }

  const titleA = normalizeText(a.source_title);
  const titleB = normalizeText(b.source_title);
  // A scored, source-governed event might have parallel independently
  // corroborating publisher stories. Equivalent event details are the
  // conservative dedupe boundary; boilerplate summaries never suffice.
  if (!titleIdentityCompatible(a.source_title, b.source_title)) return false;
  // Source-native unscored observations have no signed event identity.
  // Even identical template text can describe separate recurring events.
  const liveA = String(a.public_status ?? "") === "live_observed";
  const liveB = String(b.public_status ?? "") === "live_observed";
  if (liveA || liveB) return false;

  if (titleA.length >= 32 && titleA === titleB) return true;

  const titleOverlap = overlap(tokens(a.source_title), tokens(b.source_title));
  const titleShared = (titleOverlap.containment * titleOverlap.minSize);
  if (titleOverlap.minSize < 4 || titleShared < 3) return false;

  const summaryA = normalizeText(a.summary);
  const summaryB = normalizeText(b.summary);
  const exactSummary = summaryA.length >= 32 && summaryA === summaryB;
  const summaryOverlap = overlap(tokens(a.summary), tokens(b.summary));
  const compellingSummary = exactSummary ||
    (summaryOverlap.minSize >= 5 && summaryOverlap.jaccard >= 0.80) ||
    (summaryOverlap.minSize >= 8 && summaryOverlap.containment >= 0.78);
  if (compellingSummary && titleOverlap.containment >= 0.38) return true;

  // When summaries are absent, require very high headline agreement.
  return titleOverlap.minSize >= 6 &&
    (titleOverlap.jaccard >= 0.86 || titleOverlap.containment >= 0.90);
}

/**
 * Customer-facing story dedupe.
 *
 * Rows are expected newest-first. We keep the first/newest representative and
 * suppress only near-identical scored evidence inside the same category and a
 * bounded 72-hour window. Template-based live observations use exact matching
 * only so distinct locations/developments are never collapsed by fuzzy text.
 * This does not mutate source history or scoring provenance.
 */
export function dedupePublicIntelligenceRows<T extends PublicIntelligenceDedupeRow>(
  rows: T[],
  maxRows = 300,
): T[] {
  const accepted: T[] = [];
  const sorted = [...rows].sort((a, b) => rowTime(b) - rowTime(a));

  for (const row of sorted) {
    if (accepted.some((prior) => sameStory(row, prior))) continue;
    accepted.push(row);
    if (accepted.length >= maxRows) break;
  }

  return accepted;
}
