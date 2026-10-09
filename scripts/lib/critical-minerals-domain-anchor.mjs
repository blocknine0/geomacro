// This deterministic canonical category gate recognizes explicit names of
// minerals / rare-earth materials in the same languages already admitted by
// governed GDELT discovery. Words like "supply", "industry" or "export" do
// NOT qualify by themselves. Severity, confidence, source rights, prompt
// attribution, publisher identity and category-match gates stay independent.
export const GLOBAL_CRITICAL_MINERALS_DOMAIN_ANCHOR =
  /(?:\b(?:rare[- ]earths?|ree\b|rare[- ]earth elements?|critical minerals?|strategic minerals?|neodymium|praseodymium|dysprosium|terbium|ndfeb|permanent magnets?|gallium|germanium|antimony|tungsten|graphite|lithium|cobalt|nickel|lynas|mp materials|iluka|tierras raras|minerales cr[ií]ticos|min[eé]raux critiques|terres rares|seltene erden|kritische mineralien|terre rare|terras raras|minerais cr[ií]ticos)\b|稀土|レアアース|희토류|редкоземел\p{L}*)/iu;

export function hasExplicitCriticalMineralsDomainAnchor(text) {
  return GLOBAL_CRITICAL_MINERALS_DOMAIN_ANCHOR.test(String(text ?? ""));
}
