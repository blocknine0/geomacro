import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { collectRelevantArticles } from "../../scripts/lib/gdelt-gal-fastlane-fallback.mjs";
import { privatePublisherPreAdmission } from "../../scripts/lib/private-scoring-candidate-admission.mjs";

const now = new Date("2026-10-09T09:00:00Z");
const title = "Critical minerals export licensing affects rare earth magnet supply chains";
function item(
  url: string,
  date = "2026-10-09T08:45:00Z",
  articleTitle = title,
  desc = "Neodymium and gallium processing export controls affect global production and supply.",
) {
  return { url, title: articleTitle, date, desc };
}
const RARE_EARTH_ANCHOR =
  /\b(rare[- ]earths?|ree\b|rare[- ]earth elements?|critical minerals?|strategic minerals?|neodymium|praseodymium|dysprosium|terbium|ndfeb|permanent magnets?|gallium|germanium|antimony|tungsten|graphite|lithium|cobalt|nickel|lynas|mp materials|iluka)\b/i;
function file(rows: Array<Record<string, unknown>>) {
  return { stamp: "20261009084500", text: rows.map((x) => JSON.stringify(x)).join("\n") };
}
function admit(article: Record<string, unknown>, rejects: Record<string, number> = {}) {
  const check = privatePublisherPreAdmission(article, { now, freshnessMs: 6 * 60 * 60_000 });
  if (!check.ok) {
    rejects[check.reason] = (rejects[check.reason] || 0) + 1;
    return false;
  }
  const sourceText = `${String(article.title || "")} ${String(article.description || "")}`;
  if (!RARE_EARTH_ANCHOR.test(sourceText)) {
    rejects.domain_anchor_missing = (rejects.domain_anchor_missing || 0) + 1;
    return false;
  }
  return true;
}

describe("#1827 prevalidate governed GAL publisher identity BEFORE rare-earth candidate ranking", () => {
  it("skips invalid high-signal candidates and continues to real HTTPS publishers", () => {
    const sample = file([
      item("http://invalid.example.org/rare-earth-export-control"),
      item("https://www.firstpublisher.example.org/rare-earth-magnet-supply"),
      item("https://secondpublisher.example.net/critical-minerals-export"),
      item("https://thirdpublisher.example.com/rare-earth-processing"),
    ]);
    const earlier = collectRelevantArticles(sample, "rare_earth", now, 6 * 60 * 60_000, new Set());
    expect(earlier).toHaveLength(4);
    const rejects: Record<string, number> = {};
    const admitted = collectRelevantArticles(sample, "rare_earth", now, 6 * 60 * 60_000, new Set(), article => {
      return admit(article, rejects);
    });
    expect(admitted).toHaveLength(3);
    expect(rejects.publisher_url_invalid).toBe(1);
    expect(admitted[0].url).toContain("https://www.firstpublisher.example.org/");
    expect(admitted[0].sourceDomain).toBe("firstpublisher.example.org");
    expect(admitted.every(x => x.url.startsWith("https:"))).toBe(true);
    expect(admitted.slice(0, 2).map(x => x.sourceDomain)).toEqual([
      "firstpublisher.example.org", "secondpublisher.example.net",
    ]);
  });
  it("does not expand source freshness or accept stale publisher dates to make 3-domain numbers pass", () => {
    const sample = file([
      item("https://stale.example.org/critical-minerals", "2026-10-08T08:45:00Z"),
      item("https://fresh.example.org/critical-minerals", "2026-10-09T08:45:00Z"),
    ]);
    const rows = collectRelevantArticles(sample, "rare_earth", now, 6 * 60 * 60_000, new Set(), admit);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceDomain).toBe("fresh.example.org");
  });
  it("skips topically related candidates without the canonical title/description anchor", () => {
    const sample = file([
      item("https://broad.example.org/export-control", "2026-10-09T08:55:00Z",
        "Government expands mineral processing under export controls",
        "The policy shifts supply-chain capacity."),
      item("https://first.example.org/rare-earth-export-license", "2026-10-09T08:50:00Z"),
      item("https://second.example.net/neodymium-magnet-output", "2026-10-09T08:45:00Z"),
    ]);
    const rejects: Record<string, number> = {};
    const rows = collectRelevantArticles(
      sample, "rare_earth", now, 6 * 60 * 60_000, new Set(),
      article => admit(article, rejects),
    );
    expect(rows).toHaveLength(2);
    expect(rejects.domain_anchor_missing).toBe(1);
    expect(rows.every(row => RARE_EARTH_ANCHOR.test(`${row.title} ${row.description}`))).toBe(true);
  });
  it("does not modify public classifier, original GAL quotas or collection for non-private mode", () => {
    const helper = readFileSync("scripts/lib/gdelt-gal-fastlane-fallback.mjs", "utf8");
    const ingest = readFileSync("scripts/ingest-news.js", "utf8");
    const workflow = readFileSync(".github/workflows/restricted-private-current-scoring.yml", "utf8");
    expect(helper).toContain("MAX_PROBE_REQUESTS = 60");
    expect(helper).toContain("MAX_PARALLEL_PROBES = 6");
    expect(helper).toContain("if (privateArticleAdmission && !privateArticleAdmission(candidate)) continue;");
    expect(helper).toContain("seen.add(url);");
    expect(helper).not.toContain("severity:");
    expect(ingest).toContain("privateArticleAdmission: PRIVATE_B2_STAGE");
    expect(ingest).toContain("MAX_ARTICLE_AGE_MS,");
    expect(ingest).toContain("ALLOW[categoryName]?.test(sourceText)");
    expect(ingest).toContain("domain_anchor_missing");
    expect(workflow).toContain('GROQ_MAX_REQUESTS_PER_RUN: "3"');
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY:');
    expect(workflow).toContain("'1' || '2'");
    expect(workflow).toContain("private_gri_singleton:");
    expect(workflow).not.toContain("schedule:");
  });
});
