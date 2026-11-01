-- "Sync now" on Home. Nothing can connect into the office, so the button only leaves a request here;
-- the agent collects it when it polls (raw.ingest, type "poll") and reports back (type "progress").
-- Every cycle reports progress, so the button also shows a scheduled sync that is already running.

create table app.sync_state (
    company       text        primary key,
    requested_at  timestamptz,                         -- set by the button, cleared when the agent takes it
    requested_by  text,
    running       boolean     not null default false,
    percent       smallint    not null default 0 check (percent between 0 and 100),
    entity        text,                                -- what is being read now
    started_at    timestamptz,
    updated_at    timestamptz,                         -- last word about the running cycle
    finished_at   timestamptz,
    last_ok       boolean,
    agent_seen_at timestamptz                          -- last poll or progress from the agent
);

-- Is the agent alive: it polls every few seconds, and reports at least every 15 s during a cycle.
-- A cycle with no word for 5 minutes has died; a request not collected in 10 minutes is dropped.
create or replace function app.sync_status(p_company text) returns jsonb
language sql stable security definer set search_path = app, pg_temp as $$
    select jsonb_build_object(
        'state', case
            when s.running and s.updated_at > now() - interval '5 minutes' then 'running'
            when s.requested_at > now() - interval '10 minutes' then
                case when s.agent_seen_at > now() - interval '2 minutes' then 'requested' else 'offline' end
            else 'idle' end,
        'percent', coalesce(s.percent, 0),
        'entity', s.entity,
        'ok', s.last_ok,
        'finished_at', s.finished_at)
    from (select 1) one left join app.sync_state s on s.company = p_company
$$;

-- Returns 'requested', 'running' (one is already going; nothing added) or 'offline' (no agent to do it).
create or replace function app.request_sync(p_company text, p_email text) returns text
language plpgsql security definer set search_path = app, pg_temp as $$
declare
    s app.sync_state;
begin
    insert into sync_state (company) values (p_company) on conflict (company) do nothing;
    select * into s from sync_state where company = p_company for update;
    if s.running and s.updated_at > now() - interval '5 minutes' then
        return 'running';
    end if;
    if s.agent_seen_at is null or s.agent_seen_at <= now() - interval '2 minutes' then
        -- Not queued: an agent coming back hours later should not start a sync nobody is waiting for.
        update sync_state set requested_at = null where company = p_company;
        return 'offline';
    end if;
    update sync_state set requested_at = now(), requested_by = p_email, running = false
    where company = p_company and (requested_at is null or requested_at <= now() - interval '10 minutes');
    return 'requested';
end $$;

revoke all on table app.sync_state from public;
revoke all on function app.sync_status(text), app.request_sync(text, text) from public;
grant execute on function app.sync_status(text), app.request_sync(text, text) to dash_web;

-- As in 20261027000001_raw.sql, plus "poll" and "progress".
create or replace function raw.ingest(p jsonb) returns jsonb
language plpgsql security definer set search_path = raw, pg_temp as $$
declare
    n_rows    int := 0;
    n_dropped int := 0;
    v_snap    uuid;
    v_state   text := p->>'state';
    v_claimed boolean;
begin
    case p->>'type'
    when 'batch' then
        v_snap := nullif(p->'snapshot'->>'id', '')::uuid;
        insert into raw.record as r (company, entity, key, doc, snapshot_id, synced_at)
        select p->>'company', p->>'entity', rec->>(p->>'key'), rec, v_snap, now()
        from jsonb_array_elements(p->'records') rec
        on conflict (company, entity, key) do update
            set doc = excluded.doc, snapshot_id = excluded.snapshot_id, synced_at = excluded.synced_at
            where r.doc is distinct from excluded.doc or r.snapshot_id is distinct from excluded.snapshot_id;
        get diagnostics n_rows = row_count;

        if v_snap is not null and (p->'snapshot'->>'final')::boolean then
            delete from raw.record
            where company = p->>'company' and entity = p->>'entity'
              and snapshot_id is distinct from v_snap;
            get diagnostics n_dropped = row_count;
        end if;

    when 'cycle' then
        insert into raw.sync_cycle (company, full_run, ok, started_at, finished_at, entities)
        values (p->>'company', (p->>'full')::boolean, (p->>'ok')::boolean,
                raw.ist(p->>'started_at'), raw.ist(p->>'finished_at'), coalesce(p->'entities', '[]'));
        perform rpt.refresh_kpi(p->>'company');

    when 'heartbeat' then
        insert into raw.heartbeat (host, version, at, last_cycle_at, last_cycle_ok)
        values (p->>'host', p->>'version', raw.ist(p->>'at'), raw.ist(p->>'last_cycle_at'),
                (p->>'last_cycle_ok')::boolean)
        on conflict (host) do update set version = excluded.version, at = excluded.at,
            last_cycle_at = excluded.last_cycle_at, last_cycle_ok = excluded.last_cycle_ok,
            received_at = now();

    when 'poll' then
        -- Takes a waiting "Sync now" request; a request too old to matter is cleared without running.
        insert into app.sync_state (company, agent_seen_at) values (p->>'company', now())
        on conflict (company) do update set agent_seen_at = now();
        update app.sync_state
        set requested_at = null, running = requested_at > now() - interval '10 minutes',
            percent = 0, entity = null, started_at = now(), updated_at = now()
        where company = p->>'company' and requested_at is not null
          and not (running and updated_at > now() - interval '5 minutes')
        returning running into v_claimed;
        return jsonb_build_object('requested', coalesce(v_claimed, false));

    when 'progress' then
        insert into app.sync_state (company) values (p->>'company') on conflict (company) do nothing;
        update app.sync_state
        set running = v_state <> 'done',
            percent = case v_state when 'start' then 0 when 'done' then 100 else (p->>'percent')::smallint end,
            entity = case when v_state = 'done' then null else p->>'entity' end,
            started_at = case when v_state = 'start' then now() else started_at end,
            requested_at = case when v_state = 'start' then null else requested_at end,
            finished_at = case when v_state = 'done' then now() else finished_at end,
            last_ok = case when v_state = 'done' then (p->>'ok')::boolean else last_ok end,
            updated_at = now(), agent_seen_at = now()
        where company = p->>'company';

    else
        raise exception 'unknown payload type %', p->>'type';
    end case;

    return jsonb_build_object('upserted', n_rows, 'dropped', n_dropped);
end $$;
