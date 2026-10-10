// Private classifier admission scheduling, NOT event corroboration or rights.
 // Spread a bounded candidate window across actually identified first-party
// publisher hosts before filling remaining slots with same-host headlines.
// No new source URLs are fetched, and no eligibility is inferred from diversity.
export function selectPrivatePublisherDiverseCandidates(candidates, limit) {
  if (!Array.isArray(candidates) || !Number.isInteger(limit) || limit < 0 || limit > 100) {
    throw new Error("PRIVATE_PUBLISHER_SELECTION_INVALID");
  }
  const ordered = [...candidates].sort((a, b) =>
    Date.parse(b?.publishedAt ?? 0) - Date.parse(a?.publishedAt ?? 0));
  const first = [];
  const remaining = [];
  const seen = new Set();
  for (const row of ordered) {
    const native = row?.discoveryProvider === "official_native_rss" &&
      row?.nativePublishedAtVerified === true && row?.privateOnly === true;
    const host = native && typeof row.sourceDomain === "string"
      ? row.sourceDomain.toLowerCase().replace(/^www\./u, "") : "";
    // Only an explicit, eligible-looking original-publisher host can form a
    // private scheduling family; unknowns keep their normal recency priority.
    if (!host || !/^[a-z0-9.-]+\.[a-z]{2,24}$/u.test(host)) {
      first.push(row);
    } else if (!seen.has(host)) {
      seen.add(host);
      first.push(row);
    } else {
      remaining.push(row);
    }
  }
  return [...first, ...remaining].slice(0, limit);
}


// #1827: Private, one-slot canonical scoring cannot reserve that *entire*
// window for a GDELT INDEX discovery while a publisher-native, already
// pre-admitted original article exists. This selects only which article
// receives classifier budget. No news is invented, no rights are granted,
// and canonical classifier/scoring/GRO gates are wholly unchanged.
export function allocatePrivateScoringSlots({
  guardianCandidates=[],otherCandidates=[],gdeltCandidates=[],limit,
}={}) {
  if(![guardianCandidates,otherCandidates,gdeltCandidates].every(Array.isArray) ||
     !Number.isInteger(limit)||limit<1||limit>100)
    throw Error("PRIVATE_SCORING_SLOT_BUDGET_INVALID");

  const publisherNative=otherCandidates.filter(row=>
    row?.discoveryProvider==="official_native_rss" &&
    row?.nativePublishedAtVerified===true &&
    row?.privateOnly===true &&
    row?.rightsVerified===false &&
    row?.commercialEligible===false &&
    typeof row?.sourceDomain==="string" &&
    typeof row?.url==="string" &&
    (()=>{try{
      const u=new URL(row.url);
      return u.protocol==="https:" && !u.username && !u.password &&
        u.hostname.toLowerCase()===row.sourceDomain.toLowerCase() &&
        Number.isFinite(Date.parse(row.publishedAt));
    }catch{return false;}})()
  );
  if(limit===1 && publisherNative.length) {
    return {
      primary:selectPrivatePublisherDiverseCandidates(publisherNative,1),
      gdelt:[],native_original_singleton_prioritized:true,
    };
  }

  // Preserve existing multi-slot 1/3-GDELT budget and guardian ordering.
  // The single-slot exception is explicitly restricted to publisher-native
  // already admitted originals, not to arbitrary URLs or paid entitlement.
  const gdeltLimit=Math.min(gdeltCandidates.length,
    Math.max(1,Math.floor(limit/3)));
  const primary=selectPrivatePublisherDiverseCandidates(
    [...guardianCandidates,...otherCandidates],limit-gdeltLimit);
  return {
    primary,gdelt:gdeltCandidates.slice(0,gdeltLimit),
    native_original_singleton_prioritized:false,
  };
}
