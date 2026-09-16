-- Hard fail-closed cap for future live distribution retries.
-- Live publishing remains disabled by config; this prevents a broken endpoint from
-- accumulating unbounded delivery attempts if/when the worker is later activated.

alter table public.early_warning_distribution_receipts
  add constraint early_warning_distribution_attempt_cap_check
  check (attempt_count <= 5);

comment on constraint early_warning_distribution_attempt_cap_check
  on public.early_warning_distribution_receipts is
  'At most five claimed delivery attempts are permitted per Early Warning alert/channel receipt.';
