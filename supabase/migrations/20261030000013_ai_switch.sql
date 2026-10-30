-- On/off switch for the Claude API (Settings screen). One row, shared by everyone who signs in.
-- dash_web stays read-only on tables: it reads and changes the switch only through these two functions.

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

create table app.ai_switch (
    id         boolean     primary key default true check (id),   -- only ever one row
    enabled    boolean     not null default true,
    updated_at timestamptz not null default now(),
    updated_by text
);
insert into app.ai_switch default values;

create or replace function app.ai_enabled() returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
    select enabled from app.ai_switch
$$;

create or replace function app.set_ai_enabled(p_enabled boolean, p_email text) returns void
language sql security definer set search_path = app, pg_temp as $$
    update app.ai_switch set enabled = p_enabled, updated_at = now(), updated_by = p_email
$$;

revoke all on function app.ai_enabled(), app.set_ai_enabled(boolean, text) from public;
grant usage on schema app to dash_web;
grant execute on function app.ai_enabled(), app.set_ai_enabled(boolean, text) to dash_web;
