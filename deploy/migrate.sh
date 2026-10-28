#!/usr/bin/env bash
# Applies supabase/migrations/*.sql that have not been applied yet (each in one transaction), then creates or
# updates the three restricted database logins with the passwords in .env.   bash deploy/migrate.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; source .env; set +a

psql() { docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql -c "create table if not exists public.deploy_migrations (version text primary key, applied_at timestamptz not null default now())"
for f in ../supabase/migrations/*.sql; do
  v=$(basename "$f" .sql)
  if [ -z "$(psql -tA -c "select 1 from public.deploy_migrations where version = '$v'")" ]; then
    echo "applying $v"
    { echo "begin;"; cat "$f"; echo; echo "insert into public.deploy_migrations (version) values ('$v');"; echo "commit;"; } | psql
  fi
done

psql <<SQL
do \$\$ begin
  if not exists (select from pg_roles where rolname = 'dash_web_login') then create role dash_web_login login in role dash_web; end if;
  if not exists (select from pg_roles where rolname = 'dash_ingest_login') then create role dash_ingest_login login in role dash_ingest; end if;
  if not exists (select from pg_roles where rolname = 'dash_ai_login') then create role dash_ai_login login in role dash_ai; end if;
end \$\$;
alter role dash_web_login password '${DASH_WEB_PASSWORD}';
alter role dash_ingest_login password '${DASH_INGEST_PASSWORD}';
alter role dash_ai_login password '${DASH_AI_PASSWORD}';
SQL
echo "migrations and database logins up to date"
