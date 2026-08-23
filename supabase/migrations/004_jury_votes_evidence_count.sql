alter table public.jury_votes
  add column if not exists evidence_count integer;

alter table public.jury_votes
  drop constraint if exists jury_votes_evidence_count_nonnegative;

alter table public.jury_votes
  add constraint jury_votes_evidence_count_nonnegative
  check (
    evidence_count is null
    or evidence_count >= 0
  );
