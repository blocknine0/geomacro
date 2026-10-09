import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasExplicitCriticalMineralsDomainAnchor } from "../../scripts/lib/critical-minerals-domain-anchor.mjs";
import { scoreTopicEvidence } from "../../scripts/lib/gdelt-gal-fastlane-fallback.mjs";

const fixture = [
  ["Rare earth magnet exports face new official controls", "Rare earth export restrictions affect magnet supply"],
  ["China endurece las normas para las tierras raras", "China aumenta los controles sobre tierras raras"],
  ["Controles de exportación de minerales críticos", "Exportación de minerales críticos afecta el suministro"],
  ["La Chine contrôle davantage les terres rares", "La chaîne des terres rares est perturbée"],
  ["Les minéraux critiques soumis à de nouvelles règles", "Les minéraux critiques rencontrent des restrictions"],
  ["Neue Kontrollen für seltene Erden", "Seltene Erden werden stärker kontrolliert"],
  ["Exportrestriktionen für kritische Mineralien", "Kritische Mineralien werden stärker reguliert"],
  ["Portugal reforça regras para terras raras", "Exportação de terras raras exige autorização"],
  ["Novos controles para minerais críticos", "Minerais críticos podem ter novos controles de oferta"],
  ["Restrizioni italiane per le terre rare", "Le terre rare hanno nuove regole"],
  ["中国加强稀土出口许可", "中国稀土供应受到出口政策影响"],
  ["日本でレアアース輸出規制強化", "レアアース輸出に新たな規制"],
  ["한국 희토류 수출 관리 강화", "희토류 공급망에 새로운 규정"],
  ["Россия вводит контроль за редкоземельными металлами", "Редкоземельные металлы проходят экспортный контроль"],
] as const;

describe("#1827 explicit multilingual critical minerals category anchor", () => {
  it.each(fixture)("canonical gate recognizes explicit named mineral in non-English governed discovery: %s", (headline) => {
    expect(hasExplicitCriticalMineralsDomainAnchor(headline)).toBe(true);
  });
  it("never treats generic industry, supply, export or AI buzzwords as mineral evidence", () => {
    for (const text of [
      "Major manufacturer discusses export restrictions affecting supply chains",
      "Chip production expands as AI models get faster",
      "Commodity news: new policy seeks to help factories",
      "A regional trade agreement was signed yesterday",
      "A bank increases monetary policy interest rates",
      "Basketball championship and celebrity arrivals",
    ]) expect(hasExplicitCriticalMineralsDomainAnchor(text)).toBe(false);
  });
  it("keeps fixed-category ownership, real event severity and source rights guarded separately", () => {
    const source = readFileSync("scripts/ingest-news.js", "utf8");
    expect(source).toContain("const RARE_EARTH_ANCHOR = GLOBAL_CRITICAL_MINERALS_DOMAIN_ANCHOR;");
    expect(source).toContain("rare_earth: RARE_EARTH_ANCHOR,");
    expect(source).toContain("const hasRareEarth = RARE_EARTH_ANCHOR.test(blob);");
    expect(source).toContain("const gated = passesGates(article, assessment, category.name);");
    expect(source).toContain("if (assessedCategory !== fallbackCategory)");
    expect(source).toContain("if (Number(assessment.confidence) < MIN_CONFIDENCE)");
    expect(source).toContain("if (Number(assessment.severity) < MIN_SEVERITY)");
    expect(source).toContain("if (CATEGORY_DENY[category]?.test(blob))");
    expect(scoreTopicEvidence({ title: "Lithium battery charging tips for your phone" }, "rare_earth")).toBeLessThan(3);
  });
});
