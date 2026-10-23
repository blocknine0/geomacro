import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("website lock governance", () => {
  it("keeps the lock workflow immutable at the action and credential boundary without baseline self-locking", () => {
    const workflow = read(".github/workflows/website-lock.yml");
    const verifier = read("scripts/ops/verify-website-lock.mjs");

    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toMatch(/uses: actions\/checkout@[0-9a-f]{40}/);
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("node scripts/ops/verify-website-lock.mjs");
    expect(workflow).toContain("Website lock self-test failed");

    expect(verifier).toContain("if (!config.locked)");
    expect(verifier).toContain("const protectedExact = new Set([");
    expect(verifier).toContain("const protectedPrefixes = [");
    expect(verifier).toContain("Intentional website changes require explicit founder approval");
    expect(verifier).not.toContain("lockInfrastructure.has(path)");
  });

  it("keeps the finalized Global Risk presentation pinned to its immutable approved baseline", () => {
    const workflow = read(".github/workflows/website-lock.yml");
    const verifier = read("scripts/ops/verify-website-lock.mjs");

    expect(verifier).toContain('const GLOBAL_RISK_FROZEN_BASELINE = "0270ab7876cabe372c246f76fbcf299ed1b0e1fc"');
    expect(verifier).toContain('"src/routes/global-risk.tsx"');
    expect(verifier).toContain('"src/components/gri/global-risk-domain-indices.tsx"');
    expect(verifier).toContain("GEOMACRO GLOBAL RISK FINAL LOCK VIOLATION");
    expect(verifier).toContain("byte-for-byte equivalent to its frozen baseline");
    expect(workflow).toContain("Prove final Global Risk lock fails closed");
    expect(workflow).toContain("global-risk-final-lock-negative-self-test");
    expect(workflow).toContain("Final Global Risk lock self-test failed");
  });

  it("keeps the published presentation baseline fail-closed", () => {
    const config = JSON.parse(read("config/website-lock.json"));
    expect(config.locked).toBe(true);
    expect(config.baseline_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(config.published_source_sha).toMatch(/^[0-9a-f]{40}$/);
    // Founder-authorized source-redaction baseline stays enabled. Visual/live
    // publication is independently accepted; it is never presumed by CI.
    expect(config.lock_revision).toBe("owner-approved-no-added-news-publication-delay-20261023");
    const launch = config.three_chain_launch_presentation_approval;
    const toggle = config.approved_three_category_toggle_presentation;
    const redesign = config.approved_store_reader_redesign;
    const home = config.approved_home_clarity_gri_reader;
    const immediate=config.approved_no_added_news_publication_delay;
    expect(immediate.approved_ui_commit).toBe(config.baseline_sha);
    expect(immediate.previous_baseline_sha).toBe(home.approved_ui_commit);
    expect(immediate.global_risk_final_lock_unmodified).toBe(true);
    expect(immediate.canonical_pricing_unmodified).toBe(true);
    expect(immediate.funds_authorized).toBe(false);
    expect(immediate.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(immediate.scope).toEqual(["src/routes/intelligence.tsx","src/routes/about.tsx","src/components/site-shell.tsx","src/components/intelligence/stateless-live-desk.tsx"]);
    expect(home.previous_baseline_sha).toBe(redesign.approved_ui_commit);
    expect(home.global_risk_final_lock_unmodified).toBe(true);
    expect(home.original_score_and_proof_clocks_preserved).toBe(true);
    expect(home.current_scored_gri_published).toBe(false);
    expect(home.funds_authorized).toBe(false);
    expect(home.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(redesign.previous_baseline_sha).toBe(toggle.approved_ui_commit);
    expect(redesign.canonical_pricing_unmodified).toBe(true);
    expect(redesign.global_risk_final_lock_unmodified).toBe(true);
    expect(redesign.funds_authorized).toBe(false);
    expect(redesign.marketplace_listings_claimed).toBe(false);
    expect(redesign.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(toggle.previous_baseline_sha).toBe(launch.approved_ui_commit);
    expect(toggle.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(toggle.global_risk_final_lock_unmodified).toBe(true);
    expect(toggle.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(launch.all_three_chain_merchant_activation_claimed).toBe(false);
    expect(launch.global_risk_final_lock_unmodified).toBe(true);
    expect(launch.pending_exact_sha_live_deployment_acceptance).toBe(true);
    const countryBrowser = config.approved_195_country_full_journal_browser;
    expect(countryBrowser?.previous_baseline_sha).toBe("acbbfa547ba720cd93586440f51b100016819672");
    expect(countryBrowser?.approved_ui_commit).toBe(launch.previous_baseline_sha);
    expect(countryBrowser?.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(countryBrowser?.global_risk_final_lock_unmodified).toBe(true);
    expect(countryBrowser?.source_upstream_unchanged).toBe(true);
    expect(countryBrowser?.no_unverified_585_country_news_claim).toBe(true);
    expect(countryBrowser?.source_commercial_rights_not_implied).toBe(true);
    expect(countryBrowser?.funds_authorized).toBe(false);
    expect(countryBrowser?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    const audit = config.approved_website_final_audit;
    // The prior Oct 19 website audit stays an immutable historical approval.
    // The subsequent Predge 72h wording/link change has its OWN scoped
    // owner authorization; never silently rewrite older approvals.
    expect(audit.approved_ui_commit).toBe("972d987f44f328d727fb3147daf2b6807a344a38");
    const predge = config.approved_predge_free_news_presentation_alignment;
    expect(predge.approved_ui_commit).toBe("0e595227c9dba46f7e456bdc5f1e0532cc0f6c90");
    const news=config.approved_intelligence_news_country_presentation;
    expect(news.approved_ui_commit).toBe(countryBrowser.previous_baseline_sha);
    expect(news.previous_baseline_sha).toBe(predge.approved_ui_commit);
    expect(news.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx","src/routes/intelligence.tsx"]);
    expect(news.global_risk_final_lock_unmodified).toBe(true);
    expect(news.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(predge.previous_baseline_sha).toBe(audit.approved_ui_commit);
    expect(predge.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(predge.reviewed_changes).toHaveLength(4);
    expect(predge.website_presentation_source_diff_reviewed).toBe(true);
    expect(predge.global_risk_final_lock_unmodified).toBe(true);
    expect(predge.backend_auto_ingest_unmodified).toBe(true);
    expect(predge.partner_news_redistribution_not_authorized_by_this_change).toBe(true);
    expect(predge.upstream_source_rights_not_approved_by_this_change).toBe(true);
    expect(predge.source_original_publication_delay_minutes).toBe(15);
    expect(predge.public_structured_retention_hours).toBe(72);
    expect(predge.funds_authorized).toBe(false);
    expect(predge.supabase_reactivated).toBe(false);
    expect(predge.published_source_sha_unchanged).toBe(true);
    expect(predge.pending_exact_sha_live_deployment_acceptance).toBe(true);
    const desk = read("src/components/intelligence/stateless-live-desk.tsx");
    expect(desk).not.toContain('aria-label="Filter Intelligence by country"');
    expect(desk).not.toContain("COUNTRIES_195");
    expect(desk).toContain("fetchAllDerivedNews()");
    expect(desk).toContain("JOURNAL_REFRESH_MS = 6 * 60_000");
    expect(desk).toContain("No findings match this category, search and publication window.");
    expect(desk).toContain('<option value="all">All available releases</option>');
    expect(desk).toContain("Reading the 72-hour stored derived-news journal below");
    expect(desk).toContain("Earlier original releases · Dated");
    expect(desk).toContain("/v1/public/derived-structural-72h");
    expect(desk).toContain("including the Predge pilot");
    expect(desk).toContain("not licensed for partner resale");
    expect(audit.approved_ui_commit).toBe("972d987f44f328d727fb3147daf2b6807a344a38");
    expect(audit.previous_baseline_sha).toBe("ecbf82c6bea1d77ad9b38a41cedf8b1f306ca61e");
    expect(audit.global_risk_final_lock_unmodified).toBe(true);
    expect(audit.canonical_price_amounts_unmodified).toBe(true);
    expect(audit.funds_authorized).toBe(false);
    expect(audit.pending_exact_sha_live_deployment_acceptance).toBe(true);
    const findApproval = config.approved_find_card_v1_presentation_change;
     expect(findApproval?.approved_ui_commit).toBe("5b70fc0fc83477662aa314a07dde0706be2c3640");
    expect(findApproval?.previous_baseline_sha).toBe("7af9ea7eb5a67743d730bae258dcac3724625473");
    expect(findApproval?.scope).toEqual([
      "public/schemas/v1/find-card.json",
      "src/components/intelligence/stateless-live-desk.tsx",
    ]);
    expect(findApproval?.global_risk_final_lock_unmodified).toBe(true);
    expect(findApproval?.supabase_reactivated).toBe(false);
    expect(findApproval?.funds_authorized).toBe(false);
    expect(findApproval?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    // Preserve all historical Ask approvals verbatim; the new homepage has
    // a distinct founder approval with exact UI merge SHA and unchanged funds.
    const homepage = config.approved_homepage_free_finds_live;
    expect(homepage?.approved_pr).toBe(2376);
    expect(homepage?.approved_ui_commit).toBe("ecbf82c6bea1d77ad9b38a41cedf8b1f306ca61e");
    expect(homepage?.previous_baseline_sha).toBe("7ad7e57f1b67873de3dbc050cf0eaa847e471081");
    expect(homepage?.scope).toEqual([
      "src/routes/index.tsx",
      "src/components/home/commercial-home.tsx",
      "src/components/home/live-intelligence-showcase.tsx",
    ]);
    expect(homepage?.global_risk_final_lock_unmodified).toBe(true);
    expect(homepage?.free_derived_find_card_only).toBe(true);
    expect(homepage?.original_timestamp_embargo_enforced).toBe(true);
    expect(homepage?.no_external_reviewer_or_paid_gro_claim).toBe(true);
    expect(homepage?.supabase_reactivated).toBe(false);
    expect(homepage?.funds_authorized).toBe(false);
    expect(homepage?.published_source_sha_unchanged).toBe(true);
    expect(homepage?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    // All older approvals remain immutable historical records.
    const askApproval = config.approved_chatgpt_ask_presentation_change;
    expect(askApproval?.scope).toEqual(["src/components/ask/ask-workspace.tsx"]);
    expect(askApproval?.approved_pr).toBe(2359);
    expect(askApproval?.approved_ui_commit).toBe("f98aa5088100a520e1c91300ad8a93c0036f663c");
    const streamApproval = config.approved_ask_sse_presentation_change;
    expect(streamApproval?.approved_pr).toBe(2363);
    expect(streamApproval?.approved_ui_commit).toBe("060fedbae69bf51d4a2b5bee0b30618bec70dd3f");
    const modular = config.approved_ask_modular_budget_fix;
    expect(modular?.approved_pr).toBe(2366);
    expect(modular?.approved_ui_commit).toBe("7ad7e57f1b67873de3dbc050cf0eaa847e471081");
    expect(modular?.previous_baseline_sha).toBe("060fedbae69bf51d4a2b5bee0b30618bec70dd3f");
    expect(modular?.scope).toEqual([
      "src/components/ask/ask-workspace.tsx",
      "src/components/ask/ask-answer-view.tsx",
      "src/lib/ask-legacy-transport.ts",
    ]);
    expect(modular?.approved_ui_bytes).toBeLessThanOrEqual(18000);
    expect(modular?.global_risk_final_lock_unmodified).toBe(true);
    expect(modular?.funds_authorized).toBe(false);
    expect(modular?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(streamApproval?.previous_baseline_sha).toBe("f98aa5088100a520e1c91300ad8a93c0036f663c");
    expect(streamApproval?.scope).toEqual(["src/components/ask/ask-workspace.tsx"]);
    expect(streamApproval?.global_risk_final_lock_unmodified).toBe(true);
    expect(streamApproval?.source_raw_content_exposed).toBe(false);
    expect(streamApproval?.supabase_reactivated).toBe(false);
    expect(streamApproval?.funds_authorized).toBe(false);
    expect(streamApproval?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(askApproval?.approved_ui_commit).toBe("f98aa5088100a520e1c91300ad8a93c0036f663c");
    expect(askApproval?.previous_baseline_sha).toBe("5b70fc0fc83477662aa314a07dde0706be2c3640");
    expect(askApproval?.global_risk_final_lock_unmodified).toBe(true);
    expect(askApproval?.other_locked_presentation_unmodified).toBe(true);
    expect(askApproval?.source_raw_content_exposed).toBe(false);
    expect(askApproval?.supabase_reactivated).toBe(false);
    expect(askApproval?.funds_authorized).toBe(false);
    expect(askApproval?.published_source_sha_unchanged).toBe(true);
    expect(askApproval?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    const pricingApproval = config.approved_pricing_presentation_change;
    expect(pricingApproval?.approved_pr).toBe(2240);
    expect(pricingApproval?.pricing_contract_version).toBe("geomacro.capability-usdc.v1");
    expect(pricingApproval?.previous_baseline_sha).toBe("8f44e21fee0ddc1c3f8ffec6f6c0d42ca879f15e");
    expect(pricingApproval?.approved_ui_commit).toBe("7af9ea7eb5a67743d730bae258dcac3724625473");
    expect(pricingApproval?.scope).toEqual([
      "src/components/agent-commerce-status.tsx",
      "src/components/capability-price-schedule.tsx",
      "src/components/commercial-access-guide.tsx",
      "src/components/home/live-intelligence-showcase.tsx",
      "src/routes/data-api.tsx",
      "src/routes/pricing.tsx",
    ]);
    expect(pricingApproval?.global_risk_final_lock_unmodified).toBe(true);
    expect(pricingApproval?.intelligence_risk_indices_ask_presentation_unmodified).toBe(true);
    expect(pricingApproval?.published_source_sha_unchanged).toBe(true);
    expect(pricingApproval?.funds_authorized).toBe(false);
    expect(pricingApproval?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    // Previous founder-approved Intelligence/Ask UI baselines remain independent.
    expect(config.intelligence_ssr_change_approval?.approved_ui_commit)
      .toBe("8f44e21fee0ddc1c3f8ffec6f6c0d42ca879f15e");
    expect(config.intelligence_ssr_change_approval?.global_risk_final_lock_unmodified).toBe(true);
    expect(config.intelligence_ssr_change_approval?.hybrid_ask_lock_unmodified).toBe(true);
    expect(config.intelligence_ssr_change_approval?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(config.pending_publish_acceptance).toBe(true);
    expect(config.website_privacy_baseline_status)
      .toBe("FOUNDER_APPROVED_WEBSITE_AUDIT_PENDING_EXACT_SHA_DEPLOYMENT");
    expect(config.published_source_sha).toBe("7215b0d05b05ccc4de1e5f69a333ae615abc38e3");
    expect(config.published_baseline).toContain("User will manually publish only after exact-head source/test/security verification and Lovable sync");
    expect(config.published_baseline).toContain("no x402 or GRI changes");
    expect(config.published_baseline).toContain("15-minute original-source delay");
    expect(config.published_baseline).toContain("independent 60m Global Risk remains");
  });
});
