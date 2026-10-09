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
