-- Database roles (NOLOGIN groups). Login users with passwords are created outside Git:
--   create role dash_web_login login password '...' in role dash_web;
--   create role dash_ingest_login login password '...' in role dash_ingest;
-- dash_web    : the web app; read-only on the reporting schema.
-- dash_ingest : the ingest API; may only call raw.ingest().

do $$ begin
    if not exists (select from pg_roles where rolname = 'dash_web') then create role dash_web nologin; end if;
    if not exists (select from pg_roles where rolname = 'dash_ingest') then create role dash_ingest nologin; end if;
end $$;

grant usage on schema rpt to dash_web;
grant select on all tables in schema rpt to dash_web;
alter default privileges in schema rpt grant select on tables to dash_web;
grant execute on function rpt.today(), rpt.fy_start(date), rpt.fy_label(date), rpt.aging_bucket(int) to dash_web;
revoke execute on function rpt.refresh_kpi(text) from public;

grant usage on schema raw to dash_ingest;
grant execute on function raw.ingest(jsonb) to dash_ingest;

-- The Supabase REST API roles get nothing in these schemas.
revoke all on schema rpt from anon, authenticated;
