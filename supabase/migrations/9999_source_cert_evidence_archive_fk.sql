-- Zero-to-current ordering repair: the 202610 recovery migration sorts before
-- legacy 961_source_certification_evidence_graph.sql. Add the integrity link
-- here, after the source evidence graph tables are guaranteed to exist.

do $$
begin
  if to_regclass('public.live_source_certification_evidence_archives') is not null
     and to_regclass('public.live_source_certification_evidence_runs') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'live_source_certification_evidence_archives_run_id_fkey'
         and conrelid = 'public.live_source_certification_evidence_archives'::regclass
     ) then
    alter table public.live_source_certification_evidence_archives
      add constraint live_source_certification_evidence_archives_run_id_fkey
      foreign key (run_id)
      references public.live_source_certification_evidence_runs(run_id)
      on delete restrict;
  end if;
end;
$$;
