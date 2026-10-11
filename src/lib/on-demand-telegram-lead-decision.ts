/**
 * Query-time discovery routing for the optional governed Telegram research lane.
 * This function does not read Telegram or change payment eligibility.
 */
export type FallbackCategory = "geopolitics" | "macro" | "rare_earth";

export function shouldSeekTelegramLead(input: {
  categories: readonly FallbackCategory[];
  originalArticleEvidenceSufficient: boolean;
  authorizedReaderAvailable: boolean;
}): boolean {
  return input.categories.length > 0 &&
    !input.originalArticleEvidenceSufficient &&
    input.authorizedReaderAvailable;
}
