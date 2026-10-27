# Development only: creates the restricted database logins on the LOCAL Supabase and writes .env.local.
# Run from apps/web:  powershell -File scripts/setup-local.ps1 -AllowedEmail you@example.com
# Keys this script manages are replaced; any other lines already in .env.local (e.g. ANTHROPIC_API_KEY) are kept.
param([Parameter(Mandatory)][string]$AllowedEmail)
$ErrorActionPreference = "Stop"

function New-Secret([int]$bytes = 24) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ([Convert]::ToBase64String($b) -replace '[+/=]', '')
}

$status = @{}
(npx --yes supabase status -o env --workdir ../..) | ForEach-Object {
  if ($_ -match '^([A-Z_]+)="?(.*?)"?$') { $status[$matches[1]] = $matches[2] }
}
if (-not $status.ANON_KEY) { throw "Local Supabase is not running (npx supabase start)." }

$webPw = New-Secret; $ingestPw = New-Secret; $aiPw = New-Secret; $apiKey = New-Secret 32
$sql = @"
do `$`$ begin
  if not exists (select from pg_roles where rolname = 'dash_web_login') then create role dash_web_login login in role dash_web; end if;
  if not exists (select from pg_roles where rolname = 'dash_ingest_login') then create role dash_ingest_login login in role dash_ingest; end if;
  if not exists (select from pg_roles where rolname = 'dash_ai_login') then create role dash_ai_login login in role dash_ai; end if;
end `$`$;
alter role dash_web_login password '$webPw';
alter role dash_ingest_login password '$ingestPw';
alter role dash_ai_login password '$aiPw';
"@
$sql | docker exec -i supabase_db_dhumal-dashboard psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q

$managed = [ordered]@{
  DATABASE_URL_WEB              = "postgresql://dash_web_login:$webPw@127.0.0.1:55422/postgres"
  DATABASE_URL_INGEST           = "postgresql://dash_ingest_login:$ingestPw@127.0.0.1:55422/postgres"
  DATABASE_URL_AI               = "postgresql://dash_ai_login:$aiPw@127.0.0.1:55422/postgres"
  INGEST_API_KEYS               = $apiKey
  NEXT_PUBLIC_SUPABASE_URL      = "http://127.0.0.1:55421"
  NEXT_PUBLIC_SUPABASE_ANON_KEY = $status.ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY     = $status.SERVICE_ROLE_KEY
  ALLOWED_EMAILS                = $AllowedEmail
}
$kept = @()
if (Test-Path .env.local) {
  $kept = Get-Content .env.local -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*([A-Z_]+)=' -or -not $managed.Contains($matches[1]) }
}
$lines = @($managed.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) + $kept
[IO.File]::WriteAllLines((Join-Path (Get-Location) ".env.local"), $lines)
Write-Host "Wrote .env.local (local only; other lines kept)."
