export function normalizeClaim(text=""){
  return text.toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/https?:\/\/\S+/g," ")
    .replace(/[^a-z0-9\s]/g," ")
    .replace(/\b(the|a|an|is|are|was|were|of|to|in|on|for|and|or|with)\b/g," ")
    .replace(/\s+/g," ").trim();
}
export function claimFingerprint(observation){
  const basis=[observation.country_iso3||"",observation.category||"",normalizeClaim(observation.title||""),normalizeClaim(observation.summary||"")].join("|");
  return basis;
}
