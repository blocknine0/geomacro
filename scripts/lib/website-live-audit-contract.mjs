/**
 * Side-effect-free contracts for GeoMacro's outside-in public website audit.
 * Prices and launch flags are checked against the *public* catalog. Historical
 * retired GRI variants remain in private ledgers but are not storefront offers.
 */
export function assertPublicPriceManifest(manifest, expected, version) {
  const fail = (code) => { throw Error(code); };
  const count = expected.reduce((total, row) => total + row.variants.length, 0);
  if (manifest?.pricing_version !== version ||
      manifest?.capability_count !== expected.length ||
      manifest?.price_variant_count !== count ||
      !Array.isArray(manifest?.capabilities) ||
      manifest.capabilities.length !== expected.length) fail("PUBLIC_PRICE_CATALOG_SCOPE_MISMATCH");
  const names = new Set();
  for (const row of manifest.capabilities) {
    if (names.has(row.capability)) fail("PUBLIC_PRICE_DUPLICATE_CAPABILITY");
    names.add(row.capability);
  }
  for (const capability of expected) {
    const row = manifest.capabilities.find(item => item.capability === capability.capability);
    if (!row || !Array.isArray(row.variants) ||
        row.variants.length !== capability.variants.length ||
        row.launch_status !== capability.launch_status ||
        row.new_sales_allowed !== capability.new_sales_allowed)
      fail("PUBLIC_PRICE_CAPABILITY_MISMATCH:" + capability.capability);
    const variants = new Set();
    for (const actual of row.variants) {
      if (variants.has(actual.variant)) fail("PUBLIC_PRICE_DUPLICATE_VARIANT:" + capability.capability);
      variants.add(actual.variant);
    }
    for (const expectedPrice of capability.variants) {
      const actual = row.variants.find(item => item.variant === expectedPrice.variant);
      if (!actual || actual.price_usdc !== expectedPrice.amount_usdc ||
          actual.amount_atomic !== expectedPrice.amount_atomic ||
          actual.currency !== "USDC" ||
          !Array.isArray(actual.nonpayable_network_previews) ||
          actual.nonpayable_network_previews.some(rail => rail.payable_offer_issued !== false))
        fail("PUBLIC_PRICE_AMOUNT_OR_NONPAYABLE_MISMATCH:" + capability.capability + ":" + expectedPrice.variant);
    }
  }
  // Discovery must not accidentally issue a payable quote or claim funding.
  if (names.has("gri_read") ||
      manifest.payment_authorized !== false ||
      manifest.money_transferred !== false ||
      manifest.x402_payment_requirement_issued !== false ||
      manifest.live_commercial_product_available_by_price_listing !== false)
    fail("PUBLIC_PRICE_DISCOVERY_PAYMENT_BOUNDARY_BROKEN");
  return {capabilities: expected.length, price_variants: count};
}

function hasExactUsdAmount(article, amount) {
  // "$9" must never match "$99", "$9.99" or other higher-priced offers.
  return new RegExp("\\$" + String(amount) + "(?![0-9.])", "u").test(article);
}

function offerArticle(html, attribute, id) {
  const marker = attribute + '="' + id + '"';
  const start = html.indexOf(marker);
  if (start < 0) throw Error("PUBLIC_STORE_OFFER_MISSING:" + id);
  const end = html.indexOf("</article>", start);
  if (end < 0) throw Error("PUBLIC_STORE_OFFER_INCOMPLETE:" + id);
  return html.slice(start, end);
}

export function assertLockedStorefront(html, plans, packs) {
  if (typeof html !== "string" ||
      !html.includes("Payments locked · no charge") ||
      !html.includes("Live checkout locked · no charge") ||
      !html.includes("PayPal / card checkout") ||
      !html.includes("Manual transfer / QR") ||
      html.includes('data-capability="risk_gate_bundle"'))
    throw Error("PUBLIC_STORE_LOCKED_PRESENTATION_MISMATCH");
  for (const plan of plans) {
    const article = offerArticle(html, "data-plan-id", plan.id);
    if (!hasExactUsdAmount(article, plan.price_usd) ||
        !article.includes(plan.credits_per_30_days.toLocaleString("en-US")))
      throw Error("PUBLIC_STORE_PLAN_PRICE_MISMATCH:" + plan.id);
  }
  for (const pack of packs) {
    const article = offerArticle(html, "data-pack-id", pack.id);
    if (!hasExactUsdAmount(article, pack.price_usd) ||
        !article.includes(pack.credits.toLocaleString("en-US")))
      throw Error("PUBLIC_STORE_PACK_PRICE_MISMATCH:" + pack.id);
  }
  return {plans: plans.length, packs: packs.length, checkout_locked: true};
}

/** /data-api is a legacy canonical redirect, not a second storefront. */
export function assertStoreAlias({status, location, html}, base = "https://geomacro.live") {
  if (status >= 300 && status < 400) {
    if (!location || new URL(location, base).href !== base + "/pricing")
      throw Error("PUBLIC_DATA_API_ALIAS_REDIRECT_MISMATCH");
    return "HTTP_REDIRECT";
  }
  if (status === 200 && typeof html === "string" &&
      /<link\b[^>]*rel=["']canonical["'][^>]*href=["']https:\/\/geomacro\.live\/pricing["']/iu.test(html))
    return "CANONICAL_HTML";
  throw Error("PUBLIC_DATA_API_ALIAS_UNVERIFIED");
}

export function assertBuildMarker(build, expectedSha) {
  if (build?.schema_version !== "geomacro.deployment-build.v1" ||
      build?.canonical_repository !== "blocknine0/geomacro" ||
      !/^[a-f0-9]{40}$/u.test(build.canonical_main_sha ?? ""))
    throw Error("PUBLIC_WEBSITE_BUILD_MARKER_INVALID");
  if (expectedSha &&
      (!/^[a-f0-9]{40}$/u.test(expectedSha) || build.canonical_main_sha !== expectedSha))
    throw Error("PUBLIC_WEBSITE_EXACT_SHA_MISMATCH");
  return {website_sha: build.canonical_main_sha, exact_sha_checked: Boolean(expectedSha)};
}
