const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

function loadEnv() {
  const p = path.join(__dirname, '.env.local');
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

(async () => {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.argv[2] || 'danievens99@gmail.com';

  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (le) throw le;

  const anonClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: otp, error: oe } = await anonClient.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (oe) throw oe;

  const session = otp.session;
  const jar = [];
  const supabase = createServerClient(url, anon, {
    cookies: { getAll: () => [], setAll: (arr) => { for (const c of arr) jar.push(c); } },
  });
  await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });

  const cookies = jar.map((c) => ({ name: c.name, value: c.value, path: c.options && c.options.path || '/' }));
  const user = { id: session.user.id, email: session.user.email };

  console.log(JSON.stringify({ cookies, user }));
})().catch((e) => { console.error('ERR', e.message || e); process.exit(1); });
