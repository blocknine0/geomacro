begin;

update public.live_external_sources
set
  access_type = 'MIXED',
  base_url = 'https://ucdp.uu.se/downloads/',
  notes = 'Current UCDP Candidate evidence. Bulk monthly sync uses the official download transport so the authenticated API daily request allowance is preserved for validation and targeted queries. Evidence-only; not part of frozen GRI/GRO scoring.',
  updated_at = now()
where source_id = 'ucdp_candidate';

commit;
