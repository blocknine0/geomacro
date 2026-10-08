with strict_source_map(source_id, source_family) as (
  values
    ('xinhua_english_china_rss', 'xinhua_english_china'),
    ('scmp_china_rss', 'scmp_china'),
    ('forexlive_rss', 'forexlive'),
    ('aljazeera_rss', 'aljazeera'),
    ('bbc_world_rss', 'bbc_world'),
    ('federal_reserve_press_rss', 'federal_reserve'),
    ('ecb_press_rss', 'european_central_bank'),
    ('ecb_market_information_rss', 'european_central_bank'),
    ('bis_rss_media_releases', 'bank_for_international_settlements'),
    ('bis_rss_central_banker_speeches', 'bank_for_international_settlements'),
    ('eu_council_press_rss', 'council_of_the_european_union'),
    ('un_all_documents_rss', 'united_nations'),
    ('un_human_rights_council_rss', 'united_nations'),
    ('un_geneva_press_rss', 'united_nations'),
    ('un_security_council_docs_rss', 'united_nations'),
    ('un_geneva_meeting_summaries_rss', 'united_nations'),
    ('usgs_minerals_news_rss', 'usgs'),
    ('nrcan_news_atom', 'natural_resources_canada')
),
recent as (
  select
    c.country_iso3,
    m.source_family,
    e.published_at as evidence_at
  from public.live_flash_events e
  join strict_source_map m on m.source_id = lower(trim(e.source_id))
  join public.live_flash_event_countries c on c.flash_id = e.flash_id
  where e.published_at is not null
    and e.published_at >= now() - interval '6 hours'
    and e.published_at <= now()
    and c.country_iso3 ~ '^[A-Z]{3}$'
)
select country_iso3
from recent
group by country_iso3
having count(distinct source_family) >= 2
order by count(distinct source_family) desc,
         count(*) desc,
         max(evidence_at) desc,
         country_iso3
limit 8;
