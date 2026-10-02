revoke all on public.live_country_category_coverage_matrix from public, anon, authenticated;
revoke all on public.live_country_category_coverage_matrix_status from public, anon, authenticated;
grant select on public.live_country_category_coverage_matrix to service_role;
grant select on public.live_country_category_coverage_matrix_status to service_role;
