// Creates (or confirms) the allow-listed dashboard account. Sign-up is disabled, so this is the
// only way an account comes to exist.  Usage:  node --env-file=.env.local scripts/create-user.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const emails = (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
if (!url || !key || emails.length === 0) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ALLOWED_EMAILS first.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;

for (const email of emails) {
  if (list.users.some((u) => u.email?.toLowerCase() === email)) {
    console.log(`exists   ${email}`);
    continue;
  }
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  console.log(`created  ${email}`);
}

const extra = list.users.filter((u) => u.email && !emails.includes(u.email.toLowerCase()));
if (extra.length) console.log(`note: accounts not on the allow list (they cannot sign in): ${extra.map((u) => u.email).join(", ")}`);
