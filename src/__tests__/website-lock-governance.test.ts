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

  it("treats only the generated OpenAPI document as an API contract, not unlocked website presentation", () => {
    const verifier = read("scripts/ops/verify-website-lock.mjs");
    expect(verifier).toContain('if (path === "public/openapi-x402.json") return false;');
    expect(verifier).toContain('"public/"');
    const endpointContract = read("src/__tests__/public-api-endpoints.test.ts");
    expect(endpointContract).toContain('staticPaths[endpoint.path][method.toLowerCase()]');
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
    expect(config.lock_revision).toBe("founder-approved-risk-indices-72h-dashboard-20261029");
    const typeRepairApproval=config.approved_lovable_types_github_20261028;
    expect(typeRepairApproval.type_only).toBe(true);
    expect(typeRepairApproval.visual_layout_unchanged).toBe(true);
    expect(typeRepairApproval.scope).toEqual(["src/components/home/risk-indices-preview.tsx", "src/routes/intelligence.tsx", "src/routes/__root.tsx", "vite.config.ts"]);
    expect(typeRepairApproval.vite_nitro_runtime_unchanged).toBe(true);
    expect(typeRepairApproval.seven_ask_ui_files_unmodified).toBe(true);
    expect(typeRepairApproval.global_risk_final_lock_unmodified).toBe(true);
    expect(typeRepairApproval.predge_unmodified).toBe(true);
    expect(typeRepairApproval.published_source_sha_unchanged).toBe(true);
    expect(typeRepairApproval.payment_authorized).toBe(false);
    expect(typeRepairApproval.previous_baseline_sha).toBe(config.approved_geomacro_self_certified_news_severity_20261028.approved_source_commit);
    const dashboardApproval=config.approved_risk_indices_72h_dashboard_20261029;
    expect(dashboardApproval.previous_baseline_sha).toBe(typeRepairApproval.approved_ui_commit);
    expect(config.baseline_sha).toBe(dashboardApproval.approved_ui_commit);
    expect(dashboardApproval.scope).toEqual(["src/components/risk-indices/risk-indices-workspace.tsx"]);
    expect(dashboardApproval.website_lock_remains_active).toBe(true);
    expect(dashboardApproval.global_risk_final_lock_unmodified).toBe(true);
    expect(dashboardApproval.predge_unchanged).toBe(true);
    expect(dashboardApproval.ask_unchanged).toBe(true);
    expect(dashboardApproval.pricing_and_payments_unchanged).toBe(true);
    expect(dashboardApproval.historical_repository_unchanged).toBe(true);
    expect(dashboardApproval.published_source_sha_unchanged_until_live_acceptance).toBe(true);
    const newsGriApproval=config.approved_geomacro_self_certified_news_severity_20261028;
    expect(newsGriApproval).toBeTruthy();
    expect(newsGriApproval.approved_source_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(newsGriApproval.scope).toContain("Risk Indices");
    expect(newsGriApproval.classification).toContain("OSINT");
    expect(newsGriApproval.classification).toContain("Neither source is independently event-fact-certified");
    expect(newsGriApproval.unchanged).toContain("PREDGE");
    expect(newsGriApproval.unchanged).toContain("/global-risk");
    expect(newsGriApproval.publication).toContain("pending");
    const categoryPricing=config.approved_three_category_api_pricing_20261025;
    expect(categoryPricing.previous_baseline_sha).toBe("8c9ecc7df74ac45d69dc56bbd2f6e568fd590ce6");
    const permanentArchiveApproval=config.approved_permanent_finds_archive_d1_free_reads_20261026;
    expect(categoryPricing.approved_ui_commit).toBe(permanentArchiveApproval.previous_baseline_sha);
    const languageApproval = config.approved_language_pack_navigation_fix_20261026;
    expect(permanentArchiveApproval.approved_ui_commit).toBe(languageApproval.previous_baseline_sha);
    expect(languageApproval.approved_ui_commit).toBe("5a9468e787df7e8124f3911004562fefeba75f0f");
    expect(languageApproval.previous_baseline_sha).toBe("3e710cc283c3a97e94a475bb3d8eb78af26568a3");
    expect(languageApproval.scope).toEqual(["public/geomacro-language.js", "src/components/site-shell.tsx"]);
    expect(languageApproval.global_risk_final_lock_unmodified).toBe(true);
    expect(languageApproval.paid_pricing_unmodified).toBe(true);
    expect(languageApproval.sources_and_payments_unchanged).toBe(true);
    expect(languageApproval.payment_authorized).toBe(false);
    expect(languageApproval.published_source_sha_unchanged).toBe(true);
    expect(languageApproval.pending_exact_sha_live_deployment_acceptance).toBe(true);
    const languageFallback = config.approved_language_pack_fallback_20261026;
    expect(languageFallback.previous_baseline_sha).toBe(languageApproval.approved_ui_commit);
    // The language fallback approval is a historical record; the newer OSINT label-hide
    // approval advances the active baseline without rewriting that older approval.
    expect(languageFallback.approved_ui_commit).toBe("49d13acbedcf6dd191251da6dbea10056e5b74b1");
    const osintStatusLabelApproval = config.approved_osint_status_label_hide_20261027;
    expect(osintStatusLabelApproval.approved_ui_commit).toBe("0d742df4aa4366345cf8a4d27aeaee4fea40aea8");
    expect(osintStatusLabelApproval.previous_baseline_sha).toBe("49d13acbedcf6dd191251da6dbea10056e5b74b1");
    const unscoredWordHideApproval = config.approved_intelligence_unscored_word_hide_20261027;
    const fastlaneApproval=config.approved_macro_minerals_fastlanes_20261027;
    expect(unscoredWordHideApproval.approved_ui_commit).toBe(fastlaneApproval.previous_baseline_sha);
    const factoryApproval=config.approved_news_factory_pricing_setup_20261027;
    expect(fastlaneApproval.approved_ui_commit).toBe(factoryApproval.previous_baseline_sha);
    const overviewApproval = config.approved_api_agent_buyer_overview_20261027;
    expect(factoryApproval.approved_ui_commit).toBe(overviewApproval.previous_baseline_sha);
    const homeApproval = config.approved_homepage_navigation_motion_20261028;
    expect(overviewApproval.approved_ui_commit).toBe(homeApproval.previous_baseline_sha);
    const findsApproval = config.approved_homepage_finds_visibility_20261028;
    expect(homeApproval.approved_ui_commit).toBe(findsApproval.previous_baseline_sha);
    const askChatApproval = config.approved_ask_three_category_chat_20261028;
    expect(findsApproval.approved_ui_commit).toBe(askChatApproval.previous_baseline_sha);
    const publicAskApproval = config.approved_ask_public_geomacro_info_20261028;
    expect(askChatApproval.approved_ui_commit).toBe(publicAskApproval.previous_baseline_sha);
    const priceDedup=config.approved_store_price_dedup_news_coverage_20261028;
    expect(publicAskApproval.approved_ui_commit).toBe(priceDedup.previous_baseline_sha);
    const askConversationApproval = config.approved_ask_conversational_intelligence_20261028;
    expect(priceDedup.approved_ui_commit).toBe(askConversationApproval.previous_baseline_sha);
    expect(askConversationApproval.approved_ui_commit).not.toBe(config.baseline_sha);
    // Historical approval chain is retained; the independent founder-approved
    // GeoMacro news+OSINT Risk Indices copy now has its own active baseline.
    expect(typeRepairApproval.previous_baseline_sha).toBe(newsGriApproval.approved_source_commit);
    expect(askConversationApproval.scope).toEqual(["src/components/ask/ask-workspace.tsx"]);
    expect(askConversationApproval.predge_unmodified).toBe(true);
    expect(askConversationApproval.global_risk_final_lock_unmodified).toBe(true);
    expect(askConversationApproval.published_source_sha_unchanged).toBe(true);
    expect(askConversationApproval.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(priceDedup.paid_pricing_unmodified).toBe(true);
    expect(priceDedup.payment_authorized).toBe(false);
    expect(publicAskApproval.public_information_only).toBe(true);
    expect(publicAskApproval.private_retrieval_added).toBe(false);
    expect(publicAskApproval.payment_authorized).toBe(false);
    expect(askChatApproval.predge_unmodified).toBe(true);
    expect(askChatApproval.payment_authorized).toBe(false);
    expect(askChatApproval.source_rights_and_original_clocks_preserved).toBe(true);
    expect(askChatApproval.scope).toContain("src/components/ask/ask-workspace.tsx");
    expect(findsApproval.predge_unmodified).toBe(true);
    expect(findsApproval.source_clocks_and_rights_unchanged).toBe(true);
    expect(findsApproval.payment_authorized).toBe(false);
    expect(homeApproval.predge_unmodified).toBe(true);
    expect(homeApproval.paid_pricing_unmodified).toBe(true);
    expect(homeApproval.payment_authorized).toBe(false);
    expect(homeApproval.scope).toContain("src/components/intelligence-background.tsx");
    expect(overviewApproval.scope).toEqual(["src/routes/data-api.tsx", "src/components/capability-price-schedule.tsx"]);
    expect(overviewApproval.predge_unmodified).toBe(true);
    expect(overviewApproval.internal_tool_implementation_retained).toBe(true);
    expect(overviewApproval.paid_pricing_unmodified).toBe(true);
    expect(overviewApproval.payment_authorized).toBe(false);
    expect(factoryApproval.approved_ui_commit).toBe("7678071ff8c68f238968943556295545491f98b6");
    expect(factoryApproval.scope).toEqual(["src/components/structured-product-setup.tsx","src/routes/pricing.tsx"]);
    expect(factoryApproval.global_risk_final_lock_unmodified).toBe(true);
    expect(factoryApproval.predge_unmodified).toBe(true);
    expect(factoryApproval.published_source_sha_unchanged).toBe(true);
    expect(factoryApproval.pending_exact_sha_publish_acceptance).toBe(true);
    expect(fastlaneApproval.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx","src/components/intelligence/macro-fastlane-panel.tsx"]);
    expect(fastlaneApproval.payment_authorized).toBe(false);
    expect(fastlaneApproval.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(unscoredWordHideApproval.previous_baseline_sha).toBe(osintStatusLabelApproval.approved_ui_commit);
    expect(unscoredWordHideApproval.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(unscoredWordHideApproval.payment_authorized).toBe(false);
    expect(unscoredWordHideApproval.lovable_publish_required).toBe(true);
    expect(unscoredWordHideApproval.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(languageFallback.scope).toEqual([
      "public/geomacro-language.js",
      "src/components/site-shell.tsx",
      "src/__tests__/website-language-pack-static.test.ts",
      ".github/workflows/minimum-free-derived-production-health.yml",
    ]);
    expect(languageFallback.global_risk_final_lock_unmodified).toBe(true);
    expect(languageFallback.paid_pricing_unmodified).toBe(true);
    expect(languageFallback.sources_and_payments_unchanged).toBe(true);
    expect(languageFallback.payment_authorized).toBe(false);
    expect(languageFallback.published_source_sha_unchanged).toBe(true);
    expect(languageFallback.lovable_publish_required).toBe(true);
    expect(languageFallback.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(permanentArchiveApproval.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(permanentArchiveApproval.global_risk_final_lock_unmodified).toBe(true);
    expect(permanentArchiveApproval.supabase_reactivated).toBe(false);
    expect(permanentArchiveApproval.paid_infrastructure_added).toBe(false);
    expect(permanentArchiveApproval.payment_authorized).toBe(false);
    expect(permanentArchiveApproval.ordinary_public_reads_use_d1).toBe(false);
    expect(categoryPricing.scope).toEqual(["src/components/category-api-pricing.tsx","src/components/api-keys-notice.tsx","src/components/category-api-pricing.test.tsx","src/routes/pricing.tsx","src/routes/data-api.tsx"]);
    expect(categoryPricing.canonical_intelligence_query_prices_unchanged).toBe(true);
    expect(categoryPricing.three_category_aliases_share_canonical_engine).toBe(true);
    expect(categoryPricing.no_separate_category_charge).toBe(true);
    expect(categoryPricing.predge_free_pilot_unchanged).toBe(true);
    expect(categoryPricing.payment_authorized).toBe(false);
    const credits=config.approved_intelligence_eligibility_and_credit_20261025;
    expect(credits.approved_ui_commit).toBe(categoryPricing.previous_baseline_sha);
    expect(credits.previous_baseline_sha).toBe("b4e2bb95d3c45363f88e08076db9cbfded582b08");
    expect(credits.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(credits.mandatory_attribution_visible_on_concrete_cards).toBe(true);
    expect(credits.source_neutral_homepage_remains_attribution_safe).toBe(true);
    expect(credits.global_risk_final_lock_unmodified).toBe(true);
    expect(credits.predge_and_store_prices_unmodified).toBe(true);
    expect(credits.signed_paid_evidence_gates_unmodified).toBe(true);
    const dedup=config.approved_intelligence_per_category_event_dedup_20261025;
    expect(dedup.previous_baseline_sha).toBe("9098323e67dd5a7f9f5b1fcf735562aea9fe8f66");
    expect(dedup.approved_ui_commit).toBe(credits.previous_baseline_sha);
    expect(dedup.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(dedup.global_risk_final_lock_unmodified).toBe(true);
    expect(dedup.predge_and_store_prices_unmodified).toBe(true);
    const restored=config.approved_restore_concrete_intelligence_20261025;
    expect(restored.previous_baseline_sha).toBe("ae47180dc6347023be7e6fb28439c7d3d5e14bf8");
    expect(restored.approved_ui_commit).toBe(dedup.previous_baseline_sha);
    expect(restored.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(restored.required_visible_credit_licences_preserved).toBe(true);
    expect(restored.global_risk_final_lock_unmodified).toBe(true);
    const concrete=config.approved_concrete_news_source_private_20261025;
    expect(concrete.previous_baseline_sha).toBe("a0aec989701e6333770f3088fb3b2c704279192b");
    expect(concrete.approved_ui_commit).toBe(restored.previous_baseline_sha);
    expect(concrete.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx","src/components/home/live-intelligence-showcase.tsx"]);
    expect(concrete.global_risk_final_lock_unmodified).toBe(true);
    expect(concrete.existing_prices_and_predge_unmodified).toBe(true);
    expect(concrete.mandatory_attribution_sources_not_silently_republished).toBe(true);
    const privateOsint = config.approved_unverified_private_osint_web_cards_20261025;
    expect(privateOsint.previous_baseline_sha).toBe("440d7fa5999cf8f15b40f3793585937f17e3f1f3");
    expect(privateOsint.approved_ui_commit).toBe(concrete.previous_baseline_sha);
    expect(privateOsint.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(privateOsint.raw_articles_not_redistributed).toBe(true);
    expect(privateOsint.global_risk_final_lock_unmodified).toBe(true);
    expect(privateOsint.pending_exact_sha_live_deployment_acceptance).toBe(true);
    const osintCards = config.approved_private_osint_intelligence_cards_20261025;
    expect(osintCards.previous_baseline_sha).toBe("4b51cbc84d7d94b810924efd07bf687f34e515dc");
    expect(osintCards.approved_ui_commit).toBe(privateOsint.previous_baseline_sha);
    expect(osintCards.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(osintCards.private_osint_source_rights_not_granted).toBe(true);
    expect(osintCards.global_risk_final_lock_unmodified).toBe(true);
    expect(osintCards.pending_exact_sha_live_deployment_acceptance).toBe(true);
    const launch = config.three_chain_launch_presentation_approval;
    const toggle = config.approved_three_category_toggle_presentation;
    const redesign = config.approved_store_reader_redesign;
    const home = config.approved_home_clarity_gri_reader;
    const immediate=config.approved_no_added_news_publication_delay;
    const retired = config.approved_gri_store_retirement;
    const api = config.approved_launch_api_endpoint_directory;
    const actorApproval=config.approved_ask_3domain_actor_fix_20261024;
    const homeFindApproval=config.approved_ask_index_home_find_copy_followup_20261024;
    const store = config.approved_store_product_creation;
    const newsJsonApproval = config.approved_reusable_news_json_mvp_20261025;
    expect(newsJsonApproval.previous_baseline_sha).toBe(store.approved_ui_commit);
    expect(newsJsonApproval.approved_ui_commit).toBe(osintCards.previous_baseline_sha);
    expect(newsJsonApproval.scope).toEqual([
      "src/components/news-json-workbench.tsx",
      "src/routes/data-api.tsx",
    ]);
    expect(newsJsonApproval.global_risk_final_lock_unmodified).toBe(true);
    expect(newsJsonApproval.existing_paid_pricing_unmodified).toBe(true);
    expect(newsJsonApproval.third_party_source_licence_automatically_created).toBe(false);
    expect(newsJsonApproval.funds_authorized).toBe(false);
    expect(newsJsonApproval.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(store.previous_baseline_sha).toBe(homeFindApproval.approved_ui_commit);
    expect(store.scope).toEqual(["src/components/api-endpoint-directory.tsx", "public/llms.txt", "public/openapi-x402.json"]);
    expect(store.canonical_pricing_unmodified).toBe(true);
    expect(store.global_risk_final_lock_unmodified).toBe(true);
    expect(store.production_runtime_or_secrets_changed).toBe(false);
    expect(store.synthetic_fixtures_are_not_production_evidence).toBe(true);
    expect(store.funds_authorized).toBe(false);
    expect(store.lovable_publish_required).toBe(true);
    expect(store.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(homeFindApproval.previous_baseline_sha).toBe(actorApproval.approved_ui_commit);
    expect(homeFindApproval.scope).toEqual(["src/components/home/live-intelligence-showcase.tsx"]);
    expect(homeFindApproval.global_risk_final_lock_unmodified).toBe(true);
    expect(homeFindApproval.payment_authorized).toBe(false);
    expect(homeFindApproval.published_source_sha_unchanged).toBe(true);
    expect(homeFindApproval.lovable_publish_required).toBe(true);
    expect(actorApproval.previous_baseline_sha).toBe(api.approved_ui_commit);
    expect(actorApproval.scope).toEqual(["src/components/intelligence/stateless-live-desk.tsx"]);
    expect(actorApproval.lovable_publish_required).toBe(true);
    expect(actorApproval.funds_authorized).toBe(false);
    expect(actorApproval.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(api.previous_baseline_sha).toBe(retired.approved_ui_commit);
    expect(api.scope).toEqual([
      "src/routes/data-api.tsx", "src/routes/docs.tsx",
      "src/components/api-endpoint-directory.tsx", "public/llms.txt",
      "public/openapi-x402.json",
    ]);
    expect(api.global_risk_final_lock_unmodified).toBe(true);
    expect(api.canonical_pricing_unmodified).toBe(true);
    expect(api.payment_or_evidence_gates_changed).toBe(false);
    expect(api.funds_authorized).toBe(false);
    expect(api.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(retired.previous_baseline_sha).toBe(immediate.approved_ui_commit);
    expect(retired.locked_gri_presentation_files_unmodified).toBe(true);
    expect(retired.public_gri_checkout_disabled).toBe(true);
    expect(retired.funds_authorized).toBe(false);
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
    expect(desk).toContain("fetchPermanentDerivedNews()");
    expect(desk).toContain("fetchDirectDerivedNews()");
    expect(desk).not.toContain("fetchAllDerivedNews()");
    expect(desk).not.toContain("getWebsiteDerivedNews");
    expect(desk).toContain("JOURNAL_REFRESH_MS = 2 * 60_000");
    expect(desk).toContain("No eligible concrete news matches this category, search and publication window.");
    expect(desk).toContain('<option value="all">All available releases</option>');
    expect(desk).toContain("Checking for concrete news developments");
    expect(desk).toContain("Earlier news · Dated");
    expect(desk).not.toContain("website-derived-news-html");
    expect(desk).toContain("GEOMACRO ANALYSIS");
    expect(desk).not.toContain("SOURCE / PUBLISHER");
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
