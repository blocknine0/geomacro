export const PUBLIC_DEMO_RISK_PROFILE_REASON =
  "public_demo_commercial_subset" as const;

export const PUBLIC_DEMO_CALCULATION_NAMESPACE =
  "public_demo_commercial_subset_v1" as const;

export const FEDERICO_STRICT_RISK_PROFILE_REASON =
  "federico_strict_evidence_policy_v1" as const;

export const FEDERICO_STRICT_CALCULATION_NAMESPACE =
  "federico_strict_evidence_v1" as const;

export const FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS = 6;
export const FEDERICO_STRICT_MAX_INCLUDED_EVIDENCE_ITEMS = 8;
export const FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS = 3;
export const FEDERICO_STRICT_HIGH_IMPACT_SEVERITY = 70;
export const FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES = 2;
export const FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY = 0.45;
export const FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD = 65;
export const FEDERICO_STRICT_SOURCE_INDEPENDENCE_METHOD =
  "controlled_live_flash_source_family_v2" as const;
export const FEDERICO_STRICT_RELEVANCE_METHOD =
  "country_bridge_attribution_v1" as const;

export const FEDERICO_STRICT_SOURCE_FAMILY_MAP_VERSION =
  "federico-source-family-map-v9" as const;

export const FEDERICO_STRICT_SOURCE_FAMILY_BY_ID = {
  telegram_mtproto_flash: "telegram_network",
  aljazeera_rss: "aljazeera",
  bbc_world_rss: "bbc_world",
  federal_reserve_press_rss: "federal_reserve",
  ecb_press_rss: "european_central_bank",
  ecb_market_information_rss: "european_central_bank",
  bis_rss_media_releases: "bank_for_international_settlements",
  bis_rss_central_banker_speeches: "bank_for_international_settlements",
  eu_council_press_rss: "council_of_the_european_union",
  un_all_documents_rss: "united_nations",
  un_human_rights_council_rss: "united_nations",
  un_geneva_press_rss: "united_nations",
  un_security_council_docs_rss: "united_nations",
  un_geneva_meeting_summaries_rss: "united_nations",
  nrcan_news_atom: "natural_resources_canada",
  xinhua_english_china_rss: "xinhua_english_china",
  scmp_china_rss: "scmp_china",
  forexlive_rss: "forexlive",
  mining_com_rss: "mining_com",
  usgs_minerals_news_rss: "usgs",
  reliefweb: "reliefweb_aggregator",
  gdelt_structured: "gdelt_structured",

  // Exact governed upstream identities observed in GDELT structured evidence.
  "wvtm13.com": "wvtm13.com",
  "lasvegassun.com": "lasvegassun.com",
  "kvpr.org": "kvpr.org",
  "ketr.org": "ketr.org",
  "wyso.org": "wyso.org",
  "kazu.org": "kazu.org",
  "wdbo.com": "wdbo.com",
  "mynspr.org": "mynspr.org",
  "kuaf.com": "kuaf.com",
  "whqr.org": "whqr.org",
  "wyff4.com": "wyff4.com",
  "northcountrypublicradio.org": "northcountrypublicradio.org",
  "adn.com": "adn.com",
  "whec.com": "whec.com",
  "wamc.org": "wamc.org",
  "kjzz.org": "kjzz.org",
  "720thevoice.iheart.com": "iheart.com",
  "newsradiowkcy.iheart.com": "iheart.com",
  "600kcol.iheart.com": "iheart.com",
  "newsradio910wltp.iheart.com": "iheart.com",
  "abc13.com": "abc13.com",
  "570wkbn.iheart.com": "iheart.com",
  "wrno.iheart.com": "iheart.com",
  "thehindubusinessline.com": "thehindubusinessline.com",
  "channelnewsasia.com": "channelnewsasia.com",
  "heraldglobe.com": "heraldglobe.com",
  "kogo.iheart.com": "iheart.com",
  "1150wima.iheart.com": "iheart.com",
  "800wvhu.iheart.com": "iheart.com",
  "wjno.iheart.com": "iheart.com",
  "newstalk1230.iheart.com": "iheart.com",
  "700wlw.iheart.com": "iheart.com",
  "960weli.iheart.com": "iheart.com",
  "wrak.iheart.com": "iheart.com",
  "agri-pulse.com": "agri-pulse.com",
  "powertalk1460.iheart.com": "iheart.com",
  "wham1180.iheart.com": "iheart.com",
  "1430kasi.iheart.com": "iheart.com",
  "woc1420.iheart.com": "iheart.com",
  "talk1200boston.iheart.com": "iheart.com",
  "600wrec.iheart.com": "iheart.com",
  "talkradio1059.iheart.com": "iheart.com",
  "1061fmtalk.iheart.com": "iheart.com",
  "wlac.iheart.com": "iheart.com",
  "klvi.iheart.com": "iheart.com",
  "600wmtradio.iheart.com": "iheart.com",
  "wvoc.iheart.com": "iheart.com",
  "veropatriot.iheart.com": "iheart.com",
  "wlap.iheart.com": "iheart.com",
  "newsradio1470.iheart.com": "iheart.com",
  "wdov.iheart.com": "iheart.com",
  "kwhn.iheart.com": "iheart.com",
  "wflaorlando.iheart.com": "iheart.com",
  "wiod.iheart.com": "iheart.com",
  "english.news.cn": "english.news.cn",
  "news.az": "news.az",
  "tribune.com.pk": "tribune.com.pk",
  "gulf-times.com": "gulf-times.com",
  "mymixfm.com": "mymixfm.com",
  "wtvbam.com": "wtvbam.com",
  "wiky.com": "wiky.com",
  "kelo.com": "kelo.com",
  "mymotherlode.com": "mymotherlode.com",
  "oneindia.com": "oneindia.com",
  "whtc.com": "whtc.com",
  "japanherald.com": "japanherald.com",
  "shanghaisun.com": "shanghaisun.com",
  "hani.co.kr": "hani.co.kr",
  "koreaherald.com": "koreaherald.com",
} as const;

export function federicoStrictSourceFamilyForId(
  sourceId: string,
) {
  const normalized = sourceId.trim().toLowerCase();
  if (!normalized) {
    return normalized;
  }

  return (
    FEDERICO_STRICT_SOURCE_FAMILY_BY_ID[
      normalized as keyof typeof FEDERICO_STRICT_SOURCE_FAMILY_BY_ID
    ] ?? normalized
  );
}

export const FEDERICO_STRICT_MAJOR_SOURCE_IDS = [
  "aljazeera_rss",
] as const;

// Every source admitted here is already a governed, independently identified
// source family in the live corroborator. Keep the publication layer aligned
// with that same trust universe so a source cannot help establish verification
// and then disappear from the independently-auditable evidence count.
export const FEDERICO_STRICT_AUDITABLE_SOURCE_IDS = [
  "un_all_documents_rss",
  "un_human_rights_council_rss",
  "un_geneva_press_rss",
  "un_security_council_docs_rss",
  "un_geneva_meeting_summaries_rss",
  "eu_council_press_rss",
  "ecb_press_rss",
  "ecb_market_information_rss",
  "aljazeera_rss",
  "bbc_world_rss",
  "xinhua_english_china_rss",
  "scmp_china_rss",
  "federal_reserve_press_rss",
  "forexlive_rss",
  "bis_rss_media_releases",
  "bis_rss_central_banker_speeches",
  "nrcan_news_atom",
  "usgs_minerals_news_rss",
] as const;


export type RiskObjectDeliveryProfile =
  | "CANONICAL"
  | "PUBLIC_DEMO"
  | "FEDERICO_STRICT";

export function riskObjectCalculationNamespace(
  profile: RiskObjectDeliveryProfile,
) {
  if (profile === "PUBLIC_DEMO") {
    return PUBLIC_DEMO_CALCULATION_NAMESPACE;
  }

  if (profile === "FEDERICO_STRICT") {
    return FEDERICO_STRICT_CALCULATION_NAMESPACE;
  }

  return undefined;
}

export function withPublicDemoProfileReason(
  reasonCodes: string[],
) {
  return [
    ...new Set([
      ...reasonCodes,
      PUBLIC_DEMO_RISK_PROFILE_REASON,
    ]),
  ].sort();
}
