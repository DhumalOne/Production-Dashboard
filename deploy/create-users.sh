#!/usr/bin/env bash
# Creates a sign-in account for every address in ALLOWED_EMAILS that does not have one yet (sign-up is off, so
# this is the only way an account comes to exist). Talks to the sign-in service inside Docker; its admin API is
# not reachable from the internet.   bash deploy/create-users.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; source .env; set +a

# Paths are passed without the leading "/" (Git Bash on Windows would turn "/admin" into a Windows path).
api() { docker compose exec -T web node -e "
  fetch('http://auth:9999/' + process.argv[1], { method: process.argv[2], headers: {
    Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: process.argv[3] || undefined }).then(async (r) => { const t = await r.text(); if (!r.ok) { console.error(r.status, t); process.exit(1); } console.log(t); });
" "$@"; }

existing=$(api "admin/users?per_page=1000" GET | tr 'A-Z' 'a-z')
IFS=',' read -ra emails <<< "${ALLOWED_EMAILS,,}"
for e in "${emails[@]}"; do
  e=$(echo "$e" | xargs)
  [ -z "$e" ] && continue
  if grep -q "\"email\":\"$e\"" <<< "$existing"; then
    echo "exists   $e"
  else
    api admin/users POST "{\"email\":\"$e\",\"email_confirm\":true}" > /dev/null
    echo "created  $e"
  fi
done
