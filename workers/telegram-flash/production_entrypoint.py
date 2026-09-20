import asyncio
import json
import os
import time


PRODUCTION_RSS_FEEDS = [
    {"source_id":"aljazeera_rss","name":"Al Jazeera RSS","url":"https://www.aljazeera.com/xml/rss/all.xml","event_type":"GEOPOLITICS_BREAKING","source_reliability":70.0},
    {"source_id":"bbc_world_rss","name":"BBC News World RSS","url":"https://feeds.bbci.co.uk/news/world/rss.xml","event_type":"GEOPOLITICS_BREAKING","source_reliability":85.0},
    {"source_id":"xinhua_english_china_rss","name":"Xinhua English China RSS","url":"https://www.xinhuanet.com/english/rss/chinarss.xml","event_type":"GEOPOLITICS_BREAKING","source_reliability":90.0,"country_iso3":"CHN"},
    {"source_id":"scmp_china_rss","name":"South China Morning Post China RSS","url":"https://www.scmp.com/rss/4/feed","event_type":"GEOPOLITICS_BREAKING","source_reliability":80.0,"country_iso3":"CHN"},
    {"source_id":"un_geneva_press_rss","name":"UN Geneva Press Releases RSS","url":"https://www.ungeneva.org/news-media/press-releases-list/rss.xml","event_type":"GEOPOLITICS_OFFICIAL_RELEASE","source_reliability":95.0},
    {"source_id":"un_security_council_docs_rss","name":"UN Security Council Documents RSS","url":"https://docs.un.org/rss/scdocs.xml","event_type":"GEOPOLITICS_SECURITY_DOCUMENT","source_reliability":98.0},
    {"source_id":"un_geneva_meeting_summaries_rss","name":"UN Geneva Meeting Summaries RSS","url":"https://www.ungeneva.org/news-media/meeting-summaries-list/rss.xml","event_type":"GEOPOLITICS_OFFICIAL_MEETING","source_reliability":95.0},
    {"source_id":"un_all_documents_rss","name":"UN Documents All Documents RSS","url":"https://docs.un.org/rss/allundocs.xml","event_type":"GEOPOLITICS_UN_DOCUMENT","source_reliability":98.0},
    {"source_id":"un_human_rights_council_rss","name":"UN Human Rights Council RSS","url":"https://docs.un.org/rss/hrc.xml","event_type":"GEOPOLITICS_HUMAN_RIGHTS","source_reliability":98.0},
    {"source_id":"eu_council_press_rss","name":"Council of the EU Press Releases RSS","url":"https://www.consilium.europa.eu/en/rss/pressreleases.ashx","event_type":"GEOPOLITICS_EU_OFFICIAL_RELEASE","source_reliability":95.0},
    {"source_id":"federal_reserve_press_rss","name":"Federal Reserve Press Releases","url":"https://www.federalreserve.gov/feeds/press_all.xml","event_type":"MACRO_OFFICIAL_RELEASE","source_reliability":95.0,"country_iso3":"USA"},
    {"source_id":"forexlive_rss","name":"ForexLive RSS","url":"https://www.forexlive.com/feed/news","event_type":"MACRO_BREAKING","source_reliability":65.0},
    {"source_id":"ecb_press_rss","name":"ECB Press Releases RSS","url":"https://www.ecb.europa.eu/rss/press.html","event_type":"MACRO_ECB_RELEASE","source_reliability":98.0},
    {"source_id":"ecb_market_information_rss","name":"ECB Market Information Dissemination RSS","url":"https://mid.ecb.europa.eu/rss/mid.xml","event_type":"MACRO_MARKET_INFORMATION","source_reliability":98.0},
    {"source_id":"bis_rss_media_releases","name":"BIS Media Releases RSS","url":"https://www.bis.org/doclist/all_pressrels.rss","event_type":"MACRO_BIS_RELEASE","source_reliability":98.0},
    {"source_id":"bis_rss_central_banker_speeches","name":"BIS Central Bankers Speeches RSS","url":"https://www.bis.org/doclist/cbspeeches.rss","event_type":"MACRO_BIS_SPEECH","source_reliability":95.0},
    {"source_id":"nrcan_news_atom","name":"Natural Resources Canada News Releases Atom","url":"https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada","event_type":"CRITICAL_MINERALS_GOVERNMENT_RELEASE","source_reliability":95.0},
    {"source_id":"usgs_minerals_news_rss","name":"USGS Minerals News RSS","url":"https://www.usgs.gov/news/minerals/feed","event_type":"CRITICAL_MINERALS_OFFICIAL","source_reliability":95.0},
]


# Preserve an explicit operator override. Otherwise use the production-safe
# baseline discovered during the first live smoke test. MINING.com is omitted
# because the endpoint returned persistent CDN 403 responses; the official
# USGS Minerals News RSS endpoint is used for critical-minerals coverage.
if not os.environ.get("BREAKING_RSS_FEEDS_JSON", "").strip():
    os.environ["BREAKING_RSS_FEEDS_JSON"] = json.dumps(PRODUCTION_RSS_FEEDS)


# Import only after the environment override is in place because worker.py
# resolves its feed list at module-import time.
import worker  # noqa: E402


if __name__ == "__main__":
    started_at = time.time()
    try:
        asyncio.run(worker.main())
    except KeyboardInterrupt:
        print(
            json.dumps(
                {
                    "shutdown": "keyboard_interrupt",
                    "uptime_seconds": round(time.time() - started_at, 1),
                }
            ),
            flush=True,
        )