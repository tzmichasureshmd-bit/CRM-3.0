# Credential Incident Runbook — CRM 3.0

## Status: PARTIALLY REMEDIATED — Owner action required

### What happened
Real Supabase credentials (project URL, anon key, service-role key) were committed to:
1. `.env.local.example` (tracked file — **FIXED in this session**)
2. `.env.local` (committed in git history — **NOT YET PURGED**)
3. `frontend/.env.local` (committed in git history — **NOT YET PURGED**)

### What was fixed in this session
- `.env.local.example` now contains only placeholder values (no real project ref, no real keys)

### What still requires owner authorization

#### Step 1 — Rotate the Supabase service-role key (CRITICAL — do first)
1. Go to Supabase Dashboard → Project Settings → API
2. Under "Project API keys", click "Reveal" next to service_role
3. Click "Regenerate" (this invalidates the old key immediately)
4. Update the new key in all deployment environments (Vercel, Railway, etc.)
5. Update `backend/.env` on all servers
6. Restart all backend services

#### Step 2 — Rotate the Supabase anon key
The anon key is public-facing but should still be rotated since it was exposed alongside the service-role key.
1. In Supabase Dashboard → Project Settings → API → anon key → Regenerate
2. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` in all frontend deployments
3. Update `.env.local` on all developer machines

#### Step 3 — Assess JWT signing key impact
The Supabase project JWT secret (used to sign anon/service-role JWTs) may need rotation.
Check: Supabase Dashboard → Project Settings → API → JWT Settings
If the JWT secret was exposed, regenerating it will invalidate ALL existing sessions.
Coordinate with users before doing this.

#### Step 4 — Rotate other credentials that appeared in committed .env files
Based on the blocker documentation, the following were also exposed:
- Firebase API key (rotate in Firebase Console → Project Settings → General)
- OpenAI API key (rotate at platform.openai.com → API Keys)
- SMTP app password (revoke in Gmail → Security → App Passwords)
- JWT_SECRET (generate new: `openssl rand -hex 32`, update backend + frontend)
- ENCRYPTION_KEY (generate new: `openssl rand -hex 16`, update backend)

#### Step 5 — Purge git history (requires all collaborators to re-clone)
```bash
# Install git-filter-repo: pip install git-filter-repo
git filter-repo --path .env.local --invert-paths
git filter-repo --path frontend/.env.local --invert-paths
# Force-push all branches (requires authorization)
git push origin --force --all
git push origin --force --tags
```
**Coordinate with all collaborators before force-pushing.**
All collaborators must delete their local clones and re-clone after the rewrite.

#### Step 6 — Verify cleanup
```bash
# Verify no secrets remain in history
git log --all --oneline -- ".env.local" "frontend/.env.local"
# Should return no output after purge
git grep -i "ngvmzkavvkikisprtpgd" $(git rev-list --all)
# Should return no output after purge
```

#### Step 7 — Add secret scanning to CI
Add a `.github/workflows/secret-scan.yml` or use GitHub's built-in secret scanning
(Settings → Security → Secret scanning → Enable).

### Verification evidence required to close this blocker
- [ ] Screenshot of Supabase service-role key regeneration
- [ ] All deployment environments updated with new keys
- [ ] Backend health check passes after key rotation
- [ ] Git history purge completed and verified
- [ ] All collaborators re-cloned
- [ ] Secret scanning enabled on repository
