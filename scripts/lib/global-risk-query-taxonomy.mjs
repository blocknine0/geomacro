/**
 * Fixed, source-neutral discovery vocabulary shared by Risk Stream and Ask.
 * One bucket is selected per existing provider call; no query fan-out is added.
 */
export const GLOBAL_RISK_QUERY_TAXONOMY_VERSION = "global-risk-query-taxonomy.v1";
export const GLOBAL_RISK_QUERY_ROTATION_MS = 20 * 60_000;
export const GLOBAL_RISK_QUERY_CATEGORIES = Object.freeze([
  "GEOPOLITICS", "MACRO_FX", "CRITICAL_MINERALS",
]);

const freezeBucket = (id, topicTags, terms, affectedAssets = []) => Object.freeze({
  id, topic_tags: Object.freeze(topicTags), terms: Object.freeze(terms),
  affected_assets: Object.freeze(affectedAssets),
});

export const GLOBAL_RISK_QUERY_BUCKETS = Object.freeze({
  GEOPOLITICS: Object.freeze([
    freezeBucket("conflict_mobilization", ["armed_conflict","border_mobilization","naval_blockade"],
      ["armed conflict","border mobilization","naval blockade","military escalation"]),
    freezeBucket("maritime_chokepoints", ["maritime_disruption","red_sea","hormuz","malacca","suez","panama","black_sea","taiwan_strait"],
      ["Red Sea","Bab el-Mandeb","Strait of Hormuz","Malacca Strait","Suez Canal","Panama Canal","Black Sea","Taiwan Strait"],
      ["shipping_routes","maritime_chokepoints","brent_crude","lng_spot","freight_rates"]),
    freezeBucket("critical_infrastructure", ["subsea_cable","pipeline_sabotage","grid_sabotage"],
      ["subsea cable sabotage","pipeline sabotage","power grid sabotage","critical infrastructure attack"],
      ["shipping_routes","energy_commodities","brent_crude","lng_spot"]),
    freezeBucket("sanctions", ["sanctions","secondary_sanctions","asset_freeze"],
      ["sanctions","secondary sanctions","asset freeze","sanctions enforcement"]),
    freezeBucket("export_controls", ["dual_use","semiconductor_controls","arms_export_ban"],
      ["dual-use export controls","semiconductor export ban","arms export ban","technology controls"],
      ["export_controls","rare_earths","gallium","germanium"]),
    freezeBucket("regime_instability", ["coup","martial_law","regime_instability"],
      ["coup attempt","martial law","regime instability","emergency rule"]),
    freezeBucket("labor_and_transport", ["port_strike","rail_strike","labor_disruption"],
      ["port strike","rail strike","dockworker strike","transport shutdown"],
      ["shipping_routes","freight_rates","cross_border_trade"]),
    freezeBucket("closures", ["airspace_closure","shipping_closure","sovereign_closure"],
      ["airspace closure","shipping closure","sovereign airspace restriction","port closure"],
      ["shipping_routes","maritime_chokepoints","freight_rates"]),
    freezeBucket("elections_and_state_intervention", ["elections","central_bank_independence","nationalization","windfall_tax"],
      ["election result market impact","central bank independence threat","strategic asset nationalization","windfall tax policy"]),
    freezeBucket("market_infrastructure_security", ["exchange_cyberattack","clearinghouse_risk","payment_rail_cyberattack","fdi_review"],
      ["stock exchange cyberattack","clearinghouse cyberattack","payment rail cyberattack","CFIUS foreign investment block"],
      ["equity_indices","clearinghouses","payment_rails","market_microstructure"]),
    freezeBucket("financial_warfare", ["correspondent_banking","sovereign_asset_freeze","fx_repatriation_block","eurobond_default"],
      ["correspondent banking restriction","sovereign asset freeze","FX repatriation block","Eurobond default Paris Club restructuring"],
      ["payment_rails","sanctions_exposure","sovereign_funding","fx_pairs"]),
    freezeBucket("freight_and_war_risk", ["war_risk_insurance","vlcc_freight","container_freight","baltic_dry_index"],
      ["war risk insurance premium","VLCC freight rate spike","LNG container freight spike","Baltic Dry Index freight surge"],
      ["war_risk_insurance","freight_indices","freight_rates","lng_spot"]),
  ]),
  MACRO_FX: Object.freeze([
    freezeBucket("monetary_policy", ["emergency_rate_change","qt","qe","central_bank_policy"],
      ["emergency rate hike","emergency rate cut","quantitative tightening","quantitative easing","central bank policy"],
      ["interest_rates","fx_pairs","sovereign_funding"]),
    freezeBucket("fx_controls", ["fx_intervention","currency_devaluation","currency_peg","capital_controls","repatriation_freeze"],
      ["FX intervention","currency devaluation","currency peg","capital controls","repatriation freeze"],
      ["fx_pairs","foreign_exchange","sovereign_funding"]),
    freezeBucket("sovereign_debt", ["sovereign_default","debt_restructuring","imf_bailout"],
      ["sovereign debt default","debt restructuring","IMF bailout","debt standstill"],
      ["sovereign_funding","interest_rates","fx_pairs"]),
    freezeBucket("yields_and_ratings", ["sovereign_yield_spike","credit_downgrade","funding_stress"],
      ["sovereign yield spike","credit downgrade","bond selloff","sovereign risk premium"],
      ["sovereign_funding","interest_rates","fx_pairs"]),
    freezeBucket("macro_data_shock", ["inflation_shock","cpi","pmi","gdp_shock"],
      ["inflation shock","CPI surprise","PMI contraction","GDP shock","employment report"]),
    freezeBucket("trade_retaliation", ["tariffs","customs_retaliation","trade_restrictions"],
      ["tariff increase","customs retaliation","trade restriction","import duty"],
      ["cross_border_trade","energy_commodities"]),
    freezeBucket("banking_and_payments", ["bank_liquidity","swift_restriction","payment_rail"],
      ["bank liquidity stress","SWIFT restriction","payment rail disruption","bank deposit outflow"],
      ["sovereign_funding","fx_pairs","payment_rails"]),
    freezeBucket("commodity_price_shock", ["oil_supply_price","lng_supply_price","grain_supply_price"],
      ["oil supply price shock","LNG supply disruption","grain price shock","energy import costs"],
      ["brent_crude","lng_spot","wheat","energy_commodities"]),
    freezeBucket("central_bank_liquidity_operations", ["omo","repo","reverse_repo","standing_facility","fx_reserves","swf"],
      ["open market operation repo liquidity","reverse repo standing facility","central bank FX reserve intervention","sovereign wealth fund allocation"]),
    freezeBucket("commercial_bank_health", ["cet1","tier1_capital","lcr","nsfr","deposit_flight","nii_nim","npl","stress_test"],
      ["CET1 Tier 1 capital ratio","LCR NSFR bank liquidity stress","commercial bank deposit flight","NII NIM margin pressure NPL stress test"],
      ["bank_capital","bank_liquidity","sovereign_funding"]),
    freezeBucket("interbank_funding_markets", ["sofr","euribor","tonar","shibor","mibor","hibor","basis_swap","bank_cds"],
      ["SOFR EURIBOR TONAR interbank rates","SHIBOR MIBOR HIBOR funding spread","cross currency basis swap stress","bank CDS interbank funding spread"],
      ["interbank_funding","cross_currency_basis","credit_spreads","bank_liquidity"]),
    freezeBucket("yield_curves_and_auctions", ["2y_yield","10y_yield","30y_yield","2s10s","term_premium","bond_auction","sovereign_cds","debt_to_gdp"],
      ["2Y 10Y 30Y sovereign yield curve","2s10s curve term premium shift","sovereign bond auction bid to cover tail","sovereign CDS fiscal deficit debt to GDP shock"],
      ["sovereign_yields","yield_curves","bond_auctions","credit_spreads"]),
    freezeBucket("macro_release_surprises", ["ppi","pce","wages","nfp","retail_sales","breakevens"],
      ["PPI PCE inflation breakeven surprise","wage growth NFP payroll surprise","retail sales PMI GDP release shock","consumer price producer price macro data surprise"]),
    freezeBucket("equity_indices_and_volatility", ["local_equity_index","vix","move","fx_implied_vol","risk_reversals","circuit_breaker","short_selling_ban"],
      ["national stock exchange benchmark index selloff","US S&P 500 Nasdaq STOXX 600 DAX FTSE equity index","Japan Nikkei TOPIX China CSI 300 HSI India Nifty Sensex","Brazil Ibovespa BIST Tadawul JSE ASX TSX KOSPI TAIEX","VIX MOVE FX implied volatility risk reversal","circuit breaker short selling ban market volatility","equity index futures turnover liquidity shock"],
      ["equity_indices","equity_volatility","volatility_indices","market_microstructure"]),
    freezeBucket("portfolio_and_cross_border_flows", ["ndf","fpi","fii","etf_flow","margin_liquidation"],
      ["NDF non deliverable forward market stress","FPI FII cross border capital outflow","ETF capital flow sovereign FX market","margin call liquidation cascade equity FX"],
      ["capital_flows","fx_pairs","market_microstructure"]),
    freezeBucket("crypto_stablecoin_liquidity", ["crypto_liquidity","stablecoin_liquidity","on_off_ramp"],
      ["stablecoin liquidity redemption flow","crypto exchange liquidity macro stress","stablecoin reserve market flow","cross border digital asset payment liquidity"],
      ["crypto_liquidity","stablecoin_liquidity","payment_rails"]),
    freezeBucket("banking_standards_and_contagion", ["basel_iii","basel_iv","systemic_bank","contagion"],
      ["Basel III Basel IV capital liquidity requirements","systemic bank contagion stress test","bank non performing loan ratio capital buffer","bank resolution systemic risk review"],
      ["bank_capital","bank_liquidity","sovereign_funding"]),
  ]),
  CRITICAL_MINERALS: Object.freeze([
    freezeBucket("battery_metals", ["lithium","cobalt","nickel","battery_processing"],
      ["lithium export","cobalt supply","nickel smelter","battery mineral processing"],
      ["lithium","cobalt","nickel","battery_materials"]),
    freezeBucket("copper_and_magnets", ["copper","rare_earths","ndpr","dysprosium","terbium"],
      ["copper mine","rare earths","NdPr","dysprosium","terbium","permanent magnet supply"],
      ["copper","rare_earths","ndpr","dysprosium","terbium"]),
    freezeBucket("processing_inputs", ["graphite","gallium","germanium","semiconductor_processing"],
      ["graphite processing","gallium export ban","germanium supply","semiconductor mineral processing"],
      ["graphite","gallium","germanium","semiconductor_inputs"]),
    freezeBucket("strategic_metals", ["antimony","tungsten","manganese","vanadium","titanium"],
      ["antimony export","tungsten supply","manganese processing","vanadium production","titanium sponge"],
      ["antimony","tungsten","manganese","vanadium","titanium"]),
    freezeBucket("nuclear_and_fertilizer", ["uranium","potash","phosphate"],
      ["uranium supply","potash export","phosphate fertilizer","fertilizer export restriction"],
      ["uranium","potash","phosphate"]),
    freezeBucket("state_actions", ["mineral_export_ban","royalty_hike","nationalization","stockpiling"],
      ["mineral export ban","mineral export quota","mining royalty hike","mine nationalization","strategic mineral stockpiling"],
      ["critical_minerals","export_controls","mineral_supply"]),
    freezeBucket("operations_disruption", ["mine_strike","smelter_outage","mine_closure"],
      ["mine strike","smelter outage","mine closure","concentrator shutdown"],
      ["mineral_supply","industrial_inputs","freight_rates"]),
    freezeBucket("supply_chain_chokepoint", ["mineral_processing_chokepoint","ev_supply_chain","battery_supply_chain"],
      ["mineral processing chokepoint","EV battery supply chain","semiconductor mineral bottleneck","refining capacity disruption"],
      ["battery_materials","semiconductor_inputs","industrial_inputs","shipping_routes"]),
    freezeBucket("exchange_inventories_and_warrants", ["lme","comex","shfe","ine","ice","dce","sgx","mcx"],
      ["LME COMEX CME SHFE INE exchange warehouse inventory","ICE DCE SGX MCX LBMA benchmark market stocks","cancelled warrants exchange warehouse draw","metal exchange inventory warrant financing"],
      ["exchange_inventories","warehouse_stocks","cancelled_warrants"]),
    freezeBucket("physical_curves_and_refining_charges", ["backwardation","contango","curve_spread","tc_rc","smelter_utilization"],
      ["copper backwardation contango curve spread","treatment charge refining charge TC RC","smelter utilization concentrate market premium","physical metal delivery premium time spread"],
      ["curve_spreads","treatment_charges","refining_charges","mineral_processing"]),
    freezeBucket("broader_commodity_benchmarks", ["polysilicon","gold","silver","pgm","iron_ore","aluminum","tin","zinc"],
      ["polysilicon gold silver PGM benchmark prices","iron ore aluminum tin zinc physical premium","crude refined products LNG commodity curve","potash phosphate fertilizer benchmark price"],
      ["polysilicon","precious_metals","pgm","iron_ore","aluminum","tin","zinc"]),
    freezeBucket("resource_finance_and_offtake", ["offtake","exim","dfi","project_finance","stockpile"],
      ["critical mineral offtake deal supply finance","EXIM DFI bank project finance mining","strategic mineral stockpile financing commitment","resource project lending sovereign guarantee"],
      ["project_finance","mineral_supply","sovereign_funding"]),
  ]),
});

export const COUNTRY_SOURCE_QUERY_TEMPLATE_VERSION = "country-source-query-templates.v1";

const COUNTRY_QUERY_LANES = Object.freeze({
  GEOPOLITICS: Object.freeze([
    ["official_state_actions", "government sanctions export controls election nationalization", ["state_action","sanctions","export_controls"], ["sovereign_risk","export_controls"]],
    ["banking_and_capital_controls", "correspondent banking SWIFT capital controls sovereign asset freeze", ["financial_warfare","banking_sanctions"], ["payment_rails","sanctions_exposure","fx_pairs"]],
    ["corridor_and_infrastructure", "maritime corridor port rail subsea cable pipeline grid disruption", ["corridor_disruption","infrastructure_security"], ["shipping_routes","subsea_cables","pipeline_networks"]],
    ["market_impact_news", "geopolitical risk freight insurance sovereign debt trade market", ["market_impact","freight_risk"], ["freight_rates","war_risk_insurance","sovereign_funding"]],
  ]),
  MACRO_FX: Object.freeze([
    ["central_bank", "central bank policy rate minutes repo reverse repo FX intervention reserves", ["central_bank_policy","liquidity_operations"], ["interest_rates","fx_pairs","bank_liquidity"]],
    ["national_exchange", "national stock exchange benchmark index equities turnover volatility", ["equity_markets","market_microstructure"], ["equity_indices","equity_volatility","market_microstructure"]],
    ["banking_regulator", "banking regulator CET1 Tier 1 LCR NSFR deposits stress test", ["bank_capital","bank_liquidity"], ["bank_capital","bank_liquidity","interbank_funding"]],
    ["market_news", "sovereign yields bond auction FX credit capital flows macro markets", ["rates","fx","credit","capital_flows"], ["sovereign_yields","yield_curves","capital_flows","credit_spreads"]],
  ]),
  CRITICAL_MINERALS: Object.freeze([
    ["customs_and_resource_authority", "mining ministry customs mineral export quota royalty mine policy", ["trade_customs","resource_policy"], ["mineral_supply","export_controls","industrial_inputs"]],
    ["exchange_and_inventory", "commodity exchange mineral benchmark warehouse stocks warrants", ["exchange_inventory","physical_market"], ["exchange_inventories","warehouse_stocks","cancelled_warrants"]],
    ["resource_finance_and_processing", "mine smelter refining treatment charge offtake project finance", ["processing","resource_finance"], ["mineral_processing","treatment_charges","project_finance"]],
    ["mineral_market_news", "critical minerals price supply export ban stockpile physical premium", ["mineral_market","supply_risk"], ["critical_minerals","curve_spreads","mineral_supply"]],
  ]),
});

export function buildCountrySourceDiscoveryQueries(countryName, category) {
  const normalized = categoryName(category);
  const lanes = COUNTRY_QUERY_LANES[normalized];
  const cleanName = String(countryName ?? "").replace(/[^\p{L}\p{N} .'-]/gu, " ")
    .replace(/\s+/gu, " ").trim().slice(0, 80);
  if (!lanes || cleanName.length < 2 || cleanName.length > 80) {
    throw new Error("GLOBAL_RISK_QUERY_COUNTRY_INPUT_INVALID");
  }
  return Object.freeze({
    schema: COUNTRY_SOURCE_QUERY_TEMPLATE_VERSION,
    category: normalized,
    queries: Object.freeze(lanes.map(([lane, terms, topicTags, affectedAssets]) =>
      Object.freeze({
        lane,
        query: `"${cleanName}" (${terms})`,
        topic_tags: Object.freeze(topicTags),
        affected_assets: Object.freeze(affectedAssets),
      }),
    )),
  });
}

const categoryName = value => value === "MACRO" ? "MACRO_FX" :
  value === "RARE_EARTH" ? "CRITICAL_MINERALS" : value;

export function selectGlobalRiskQueryBucket(category, now = Date.now(), rotationIndex = 0) {
  const normalized = categoryName(category);
  const buckets = GLOBAL_RISK_QUERY_BUCKETS[normalized];
  if (!buckets || !Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(rotationIndex) || rotationIndex < 0 || rotationIndex > 100_000) {
    throw new Error("GLOBAL_RISK_QUERY_INPUT_INVALID");
  }
  const slot = Math.floor(now / GLOBAL_RISK_QUERY_ROTATION_MS);
  const index = (slot + rotationIndex) % buckets.length;
  const bucket = buckets[index];
  return Object.freeze({
    category: normalized, slot, bucket_index: index, bucket_id: bucket.id,
    topic_tags: bucket.topic_tags, terms: bucket.terms,
    affected_assets: bucket.affected_assets,
  });
}
