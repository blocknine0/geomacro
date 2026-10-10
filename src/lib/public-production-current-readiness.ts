/**
 * #1827 production health truth boundary.
 *
 * Historical/last-verified baseline readability does not establish CURRENT,
 * chargeable intelligence. Only individually verified D1 hot projections
 * backed by the required B2 proof can mark a product as currently ready.
 * No metadata timestamp is refreshed and no provider/network call is made.
 */
export type PublicProduct = "intelligence" | "global_risk" | "risk_indices";
export type ProductReadiness = Record<PublicProduct, boolean>;
export type D1HotProof = { ok?: unknown; serving_store?: unknown } | null | undefined;
export type D1HotProofs = Partial<Record<PublicProduct, D1HotProof>>;

export function qualifyPublicCurrentReadiness(
  lastVerifiedBaseline: ProductReadiness,
  hot: D1HotProofs,
) {
  const current: ProductReadiness = {
    intelligence: false,
    global_risk: false,
    risk_indices: false,
  };
  for (const key of Object.keys(current) as PublicProduct[]) {
    current[key] =
      lastVerifiedBaseline[key] === true &&
      hot[key]?.ok === true &&
      hot[key]?.serving_store === "cloudflare-d1";
  }
  return {
    // Explicitly historical/structural. Never a substitute for paid readiness.
    last_verified_baseline_readable: { ...lastVerifiedBaseline },
    current_hot_product_ready: current,
    all_current_hot_products_ready: Object.values(current).every((ready) => ready === true),
  };
}
