begin;

-- USGS MCS uses several conventional country labels that differ from the
-- canonical live_country_registry names. Keep these aliases in the registry so
-- all governed source adapters resolve the same jurisdictions deterministically.
update public.live_country_registry
set aliases = aliases || array['Turkey']::text[], updated_at = now()
where iso3 = 'TUR' and not ('Turkey' = any(aliases));

update public.live_country_registry
set aliases = aliases || array['Congo (Kinshasa)']::text[], updated_at = now()
where iso3 = 'COD' and not ('Congo (Kinshasa)' = any(aliases));

update public.live_country_registry
set aliases = aliases || array['Korea, North']::text[], updated_at = now()
where iso3 = 'PRK' and not ('Korea, North' = any(aliases));

update public.live_country_registry
set aliases = aliases || array['Côte d’Ivoire', 'Cote d’Ivoire', 'Cote d''Ivoire']::text[], updated_at = now()
where iso3 = 'CIV'
  and not ('Côte d’Ivoire' = any(aliases));

commit;
