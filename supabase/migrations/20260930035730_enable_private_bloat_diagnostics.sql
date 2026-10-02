create extension if not exists pgstattuple with schema extensions;
revoke execute on function extensions.pgstattuple(regclass) from public, anon, authenticated;
revoke execute on function extensions.pgstattuple(text) from public, anon, authenticated;
revoke execute on function extensions.pgstattuple_approx(regclass) from public, anon, authenticated;
revoke execute on function extensions.pgstatindex(regclass) from public, anon, authenticated;
revoke execute on function extensions.pgstatindex(text) from public, anon, authenticated;
