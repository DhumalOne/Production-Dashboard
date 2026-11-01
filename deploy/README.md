# Production server

The dashboard runs on one Ubuntu 24.04 server (Oracle Cloud Always Free, Mumbai) at **https://dashboard.dhumal.com**.
The SAP sync agent stays inside the office (SAPSERVER) and sends changes to the server over HTTPS;
nothing connects into the office.

```
office: SAPSERVER ── agent (read-only SAP) ──HTTPS──▶ dashboard.dhumal.com
                                                     ├─ caddy  :443  HTTPS, certificate renewed automatically
                                                     ├─ web    Next.js dashboard (/api/ingest for the agent)
                                                     ├─ auth   Google sign-in at /auth/v1 (admin API blocked)
                                                     └─ db     Postgres (no open port)
```

## Files

| File | What it is |
|---|---|
| `docker-compose.yml` | The four containers |
| `Caddyfile` | HTTPS and routing |
| `make-env.mjs` | Run on the office PC: writes `deploy/.env` (all settings and secrets, gitignored) |
| `server-setup.sh` | Once per new server: Docker, firewall, security updates, India time, nightly backup |
| `migrate.sh` | Applies new `supabase/migrations/*.sql` and the three restricted database logins |
| `create-users.sh` | Makes accounts for `ALLOWED_EMAILS` (sign-up is off) |
| `backup.sh` | Nightly `pg_dump`, 14 days kept, optional upload to Oracle Object Storage |

## First install

On the office PC (Git Bash), with `deploy.env` filled in (Google client, allowed emails):

```bash
node deploy/make-env.mjs
SERVER=ubuntu@<server ip>
git archive HEAD | ssh -i ~/.ssh/dhumal_prod $SERVER "mkdir -p dhumal && tar -x -C dhumal"
scp -i ~/.ssh/dhumal_prod deploy/.env $SERVER:dhumal/deploy/.env
ssh -i ~/.ssh/dhumal_prod $SERVER "bash dhumal/deploy/server-setup.sh"
```

Then on the server (`ssh -i ~/.ssh/dhumal_prod $SERVER`, after logging in again):

```bash
cd dhumal/deploy
docker compose up -d db auth          # first start creates the database
bash migrate.sh
docker compose up -d --build          # builds the dashboard (a few minutes on first run)
bash create-users.sh
```

Oracle Cloud → VCN → Security List: allow ingress from `0.0.0.0/0` on TCP 80, TCP 443 and UDP 443
(`server-setup.sh` only opens the server's own firewall).

DNS: an **A** record `dashboard` → the server's public IP. Google Cloud → OAuth client → redirect URI
`https://dashboard.dhumal.com/auth/v1/callback`.

### Bringing the data across

Rather than re-reading 19 months of SAP over the internet, copy the office PC's synced data:

```bash
# office PC: data only (tables already exist on the server after migrate.sh)
# (no -t here: with -t, pg_dump ignores -n; rpt.kpi_daily is rebuilt by refresh_kpi below.
#  core.doc_type is left out because the migrations already fill it.)  About 85 MB.
docker exec supabase_db_dhumal-dashboard pg_dump -U postgres -d postgres --data-only -n raw -n core \
  --exclude-table-data=core.doc_type -Fc > dhumal-data.dump
scp -i ~/.ssh/dhumal_prod dhumal-data.dump $SERVER:dhumal/deploy/
# server: load it with triggers off (core is already derived), then refresh the KPIs
docker compose exec -T db pg_restore -U supabase_admin -d postgres --data-only --disable-triggers < dhumal-data.dump
docker compose exec -T db psql -U postgres -c "select rpt.refresh_kpi('DHUMAL_LIVE')"
```

Then copy the agent's `agent/state/` folder to the office machine that runs the agent, so it carries on from
where this PC stopped instead of reloading everything. A run with `--db` keeps its place in `dev_db.db` and a run
to the cloud uses `state.db`, so on that machine copy `state\dev_db.db` over `state\state.db`.

### Sync agent (office)

In `agent/config.toml` on the agent machine:

```toml
[cloud]
ingest_url = "https://dashboard.dhumal.com/api/ingest"
heartbeat_url = "https://dashboard.dhumal.com/api/ingest"
api_key = "<INGEST_API_KEYS from deploy/.env>"
```

then `powershell -File agent\install_service.ps1`.

If the agent logs `CERTIFICATE_VERIFY_FAILED: self-signed certificate in certificate chain`, something on the
office network is inspecting HTTPS. Ask IT to exempt `dashboard.dhumal.com`. Only if they can't, and they confirm
the certificate is their firewall's, set `ca_file` under `[cloud]` to that firewall's CA certificate. The firewall
can then read the API key and the data. Never turn verification off. Remove `ca_file` if the exemption comes later,
because the agent then trusts only that CA and would reject the dashboard's real certificate.

## Running on a 1 GB server

The live server is an Oracle Micro (x86, 2 vCPU, 1 GB) with 4 GB of swap, because no Arm capacity was available.
`small-server.override.yml` is copied to the server as `deploy/docker-compose.override.yml` to lower the memory
settings. The dashboard cannot be built there, so on an update, replace `docker compose up -d --build` with this,
run on the office PC from a clean `git archive HEAD` export that has `deploy/.env` copied in:

```bash
cd deploy && docker compose build web
docker save dhumal-web:latest | gzip | ssh -i ~/.ssh/dhumal_prod $SERVER "gunzip | docker load"
# server
cd dhumal/deploy && bash migrate.sh && docker compose up -d --no-build
```

## Updating

```bash
# office PC
git archive HEAD | ssh -i ~/.ssh/dhumal_prod $SERVER "tar -x -C dhumal"
# server
cd dhumal/deploy && bash migrate.sh && docker compose up -d --build
```

Adding a user: add the address to `ALLOWED_EMAILS` in `deploy/.env` on the server, then
`docker compose up -d web && bash create-users.sh`. Removing one: take it off the list and `docker compose up -d web`.

## Restoring a backup

```bash
docker compose stop web auth
docker compose exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists < backups/dhumal-YYYY-MM-DD.dump
docker compose up -d
```
