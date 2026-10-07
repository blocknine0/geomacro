begin;

-- Fresh-replay compatibility for the short-version 963 promotion function.
-- Existing production databases already have the canonical function, so this
-- migration is a no-op there. On a zero replay, create only a fail-closed
-- placeholder so the immediately following search_path hardening migration can
-- run. The canonical 963/972 migrations later replace this body completely.

do $outer$
begin
  if to_regprocedure('public.promote_source_certification_evidence_graph_run(text,text)') is null then
    execute $sql$
      create function public.promote_source_certification_evidence_graph_run(
        p_run_id text,
        p_certified_by text
      )
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      begin
        raise exception 'SOURCE_CERTIFICATION_PROMOTION_SCHEMA_NOT_READY';
      end;
      $fn$
    $sql$;
  end if;
end
$outer$;

commit;
