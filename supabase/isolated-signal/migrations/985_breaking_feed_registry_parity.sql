-- Breaking-feed registry parity for the isolated signal database.
-- These rows authorize internal lead ingestion only. They do not grant
-- commercial delivery rights, raw redistribution, or Risk Gate eligibility.

insert into public.live_external_sources (
  source_id, source_name, provider_name, category, access_type,
  authentication_type, base_url, licence_name, commercial_usage_status,
  raw_redistribution_allowed, attribution_required,
  enabled_for_ingestion, enabled_for_commercial_signals,
  country_scope, freshness_class, notes
)
values
  ('un_all_documents_rss','UN Documents All Documents RSS','United Nations','GEOPOLITICS','RSS','NONE','https://docs.un.org/rss/allundocs.xml',null,'REVIEW_REQUIRED',false,true,true,false,'GLOBAL','NEAR_REAL_TIME','Internal lead/corroboration only; exact document rights remain source-specific.'),
  ('un_human_rights_council_rss','UN Human Rights Council RSS','United Nations Human Rights Council','GEOPOLITICS','RSS','NONE','https://docs.un.org/rss/hrc.xml',null,'REVIEW_REQUIRED',false,true,true,false,'GLOBAL','NEAR_REAL_TIME','Internal lead/corroboration only.'),
  ('un_geneva_press_rss','UN Geneva Press Releases RSS','United Nations Office at Geneva','GEOPOLITICS','RSS','NONE','https://www.ungeneva.org/news-media/press-releases-list/rss.xml',null,'REVIEW_REQUIRED',false,true,true,false,'GLOBAL','NEAR_REAL_TIME','Internal lead/corroboration only.'),
  ('un_security_council_docs_rss','UN Security Council Documents RSS','United Nations Security Council','GEOPOLITICS','RSS','NONE','https://docs.un.org/rss/scdocs.xml',null,'REVIEW_REQUIRED',false,true,true,false,'GLOBAL','NEAR_REAL_TIME','Internal lead/corroboration only.'),
  ('eu_council_press_rss','Council of the EU Press Releases RSS','Council of the European Union','GEOPOLITICS','RSS','NONE','https://www.consilium.europa.eu/en/rss/pressreleases.ashx',null,'REVIEW_REQUIRED',false,true,true,false,'EUROPE','NEAR_REAL_TIME','Internal lead/corroboration only.'),
  ('ecb_press_rss','ECB Press Releases RSS','European Central Bank','MACRO','RSS','NONE','https://www.ecb.europa.eu/rss/press.html',null,'REVIEW_REQUIRED',false,true,true,false,'EUROPE','NEAR_REAL_TIME','Internal lead/corroboration only.'),
  ('ecb_market_information_rss','ECB Market Information Dissemination RSS','European Central Bank','MACRO','RSS','NONE','https://mid.ecb.europa.eu/rss/mid.xml',null,'REVIEW_REQUIRED',false,true,true,false,'EUROPE','NEAR_REAL_TIME','Internal lead/corroboration only.'),
  ('un_geneva_meeting_summaries_rss','UN Geneva Meeting Summaries RSS','United Nations Office at Geneva','GEOPOLITICS','RSS','NONE','https://www.ungeneva.org/news-media/meeting-summaries-list/rss.xml',null,'REVIEW_REQUIRED',false,true,true,false,'GLOBAL','NEAR_REAL_TIME','Internal lead/corroboration only.'),
  ('bbc_world_rss','BBC News World RSS','BBC','GEOPOLITICS','RSS','NONE','https://feeds.bbci.co.uk/news/world/rss.xml',null,'REVIEW_REQUIRED',false,true,true,false,'GLOBAL','NEAR_REAL_TIME','Discovery/corroboration only. No BBC article text is customer-facing or commercially redistributed.'),
  ('xinhua_english_china_rss','Xinhua English China RSS','Xinhua News Agency','GEOPOLITICS','RSS','NONE','https://www.xinhuanet.com/english/rss/chinarss.xml',null,'REVIEW_REQUIRED',false,true,true,false,'CHN','NEAR_REAL_TIME','Discovery/corroboration only; no raw publisher content delivery.'),
  ('scmp_china_rss','South China Morning Post China RSS','South China Morning Post','GEOPOLITICS','RSS','NONE','https://www.scmp.com/rss/4/feed',null,'REVIEW_REQUIRED',false,true,true,false,'CHN','NEAR_REAL_TIME','Discovery/corroboration only; no raw publisher content delivery.'),
  ('bis_rss_media_releases','BIS Media Releases RSS','Bank for International Settlements','MACRO','RSS','NONE','https://www.bis.org/doclist/all_pressrels.rss',null,'REVIEW_REQUIRED',false,true,true,false,'GLOBAL','NEAR_REAL_TIME','Internal lead/corroboration only.'),
  ('bis_rss_central_banker_speeches','BIS Central Bankers Speeches RSS','Bank for International Settlements','MACRO','RSS','NONE','https://www.bis.org/doclist/cbspeeches.rss',null,'REVIEW_REQUIRED',false,true,true,false,'GLOBAL','NEAR_REAL_TIME','Internal lead/corroboration only.'),
  ('nrcan_news_atom','Natural Resources Canada News Releases Atom','Natural Resources Canada','CRITICAL_MINERALS','ATOM','NONE','https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&format=atom',null,'REVIEW_REQUIRED',false,true,true,false,'CAN','NEAR_REAL_TIME','Official Canadian government discovery/corroboration feed; exact item reuse remains governed.'),
  ('nws_active_alerts_atom','NWS Active Alerts ATOM','U.S. National Weather Service / NOAA','MULTI_DOMAIN','ATOM','NONE','https://api.weather.gov/alerts/active.atom','U.S. Government public-domain data; source acknowledgement expected','COMMERCIAL_OK',false,true,true,false,'USA','REAL_TIME','Official NWS CAP/ATOM active-alert index intended for redistribution and decision-support tools. Geomacro stores normalized lead metadata only and does not represent modified data as official NWS material.')
on conflict (source_id) do update set
  source_name = excluded.source_name,
  provider_name = excluded.provider_name,
  category = excluded.category,
  access_type = excluded.access_type,
  authentication_type = excluded.authentication_type,
  base_url = excluded.base_url,
  licence_name = excluded.licence_name,
  commercial_usage_status = excluded.commercial_usage_status,
  raw_redistribution_allowed = false,
  attribution_required = true,
  enabled_for_ingestion = true,
  enabled_for_commercial_signals = false,
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();
