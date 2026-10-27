-- AI box (PRD §5): Claude writes SELECT queries over the reporting views only.
-- dash_ai can read rpt.* and write its own audit rows through audit.log_ai_question(); nothing else.
-- The app also runs every model-written query in a READ ONLY transaction with a 10 s timeout and a
-- 500-row cap (apps/web/lib/ai/sql.ts), so the role is the second line of defence, not the first.

do $$ begin
    if not exists (select from pg_roles where rolname = 'dash_ai') then create role dash_ai nologin; end if;
end $$;

grant usage on schema rpt to dash_ai;
grant select on all tables in schema rpt to dash_ai;
alter default privileges in schema rpt grant select on tables to dash_ai;
grant execute on function rpt.today(), rpt.fy_start(date), rpt.fy_label(date), rpt.aging_bucket(int) to dash_ai;
-- The reporting views read core/raw as their owner; dash_ai itself gets nothing there.
revoke all on schema core, raw from dash_ai;

-- ---------------------------------------------------------------- audit log (kept 1 year, PRD §9)
create schema if not exists audit;
revoke all on schema audit from public, anon, authenticated;

create table audit.ai_question (
    id           bigserial primary key,
    asked_at     timestamptz not null default now(),
    email        text        not null,
    question     text        not null,
    answer       text,
    queries      jsonb       not null default '[]',   -- [{sql, purpose, rows, ms, error}]
    duration_ms  int,
    input_tokens int,
    output_tokens int,
    model        text,
    error        text
);
create index ai_question_asked_idx on audit.ai_question (asked_at desc);

create or replace function audit.log_ai_question(
    p_email text, p_question text, p_answer text, p_queries jsonb, p_duration_ms int,
    p_input_tokens int, p_output_tokens int, p_model text, p_error text
) returns bigint
language sql security definer set search_path = audit, pg_temp as $$
    insert into audit.ai_question (email, question, answer, queries, duration_ms, input_tokens, output_tokens, model, error)
    values (p_email, left(p_question, 2000), left(p_answer, 20000), coalesce(p_queries, '[]'), p_duration_ms,
            p_input_tokens, p_output_tokens, p_model, left(p_error, 2000))
    returning id
$$;
revoke all on function audit.log_ai_question(text, text, text, jsonb, int, int, int, text, text) from public;
grant usage on schema audit to dash_ai;
grant execute on function audit.log_ai_question(text, text, text, jsonb, int, int, int, text, text) to dash_ai;

-- Retention: the nightly job calls audit.purge_old() to remove questions older than a year.
create or replace function audit.purge_old() returns int
language sql security definer set search_path = audit, pg_temp as $$
    with d as (delete from audit.ai_question where asked_at < now() - interval '1 year' returning 1)
    select count(*)::int from d
$$;
revoke all on function audit.purge_old() from public;
