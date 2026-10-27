-- Raw layer: every Service Layer record exactly as the office agent sent it.
-- Written only by raw.ingest(), called by the cloud ingest API with the agent's API key.

create schema if not exists raw;

create table raw.record (
    company     text        not null,
    entity      text        not null,   -- registry name, e.g. Invoices, InvoicesOpen, ChartOfAccounts
    key         text        not null,   -- value of the entity's key field (DocEntry, CardCode, ...)
    doc         jsonb       not null,
    snapshot_id uuid,                   -- set for snapshot entities; stale rows are dropped on the final batch
    synced_at   timestamptz not null default now(),
    primary key (company, entity, key)
);
create index record_snapshot_idx on raw.record (company, entity, snapshot_id);

create table raw.sync_cycle (
    id          bigserial primary key,
    company     text        not null,
    full_run    boolean     not null,
    ok          boolean     not null,
    started_at  timestamptz not null,
    finished_at timestamptz,
    entities    jsonb       not null,
    received_at timestamptz not null default now()
);
create index sync_cycle_company_idx on raw.sync_cycle (company, finished_at desc);

create table raw.heartbeat (
    host           text primary key,
    version        text,
    at             timestamptz not null,
    last_cycle_at  timestamptz,
    last_cycle_ok  boolean,
    received_at    timestamptz not null default now()
);

-- Agent times are office-local (IST) without an offset.
create or replace function raw.ist(ts text) returns timestamptz
language sql immutable as $$
    select case when ts is null or ts = '' then null
                when ts ~ '(Z|[+-]\d\d:?\d\d)$' then ts::timestamptz
                else (ts::timestamp at time zone 'Asia/Kolkata') end
$$;

-- Single entry point for everything the agent sends (see agent/dhumal_sync/sink.py).
create or replace function raw.ingest(p jsonb) returns jsonb
language plpgsql security definer set search_path = raw, pg_temp as $$
declare
    n_rows    int := 0;
    n_dropped int := 0;
    v_snap    uuid;
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
    else
        raise exception 'unknown payload type %', p->>'type';
    end case;

    return jsonb_build_object('upserted', n_rows, 'dropped', n_dropped);
end $$;

alter table raw.record enable row level security;
alter table raw.sync_cycle enable row level security;
alter table raw.heartbeat enable row level security;
revoke all on schema raw from public, anon, authenticated;
revoke all on function raw.ingest(jsonb) from public, anon, authenticated;
