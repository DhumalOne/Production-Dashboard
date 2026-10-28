-- Runs once, when the database is first created: the sign-in service logs in as supabase_auth_admin.
\set pgpass `echo "$POSTGRES_PASSWORD"`
alter user supabase_auth_admin with password :'pgpass';
alter user authenticator with password :'pgpass';
