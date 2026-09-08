begin;

alter table public.risk_gate_audit_log
  drop constraint if exists risk_gate_audit_subject_check;

alter table public.risk_gate_audit_log
  add constraint risk_gate_audit_subject_check
  check (
    subject_type in (
      'country',
      'corridor',
      'unknown'
    )
  );

comment on constraint
  risk_gate_audit_subject_check
on public.risk_gate_audit_log is
  'Risk Gate audit subjects supported by the private-pilot API. Country remains backward compatible; corridor is the signed endpoint-composed corridor pilot; unknown is retained for rejected/failed requests whose subject cannot be safely resolved.';

commit;
