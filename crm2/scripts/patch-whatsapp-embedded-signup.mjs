/**
 * Patch react-whatsapp-embedded-signup@2.0.0 so the Meta WhatsApp
 * Embedded Signup coexistence flow can pass `extras.featureType =
 * 'whatsapp_business_app_onboarding'` through to FB.login.
 *
 * The package bundles the FB.login call with a hardcoded
 * `featureType: ""`. Meta's WhatsApp Business App coexistence onboarding
 * requires `extras.featureType: 'whatsapp_business_app_onboarding'`
 * inside FB.login options. This script surgically rewrites that one
 * expression so featureType is read from the package's own `extras`
 * option (the `p` destructured param), keeping every other behavior
 * identical.
 *
 * Safe by design:
 *   - If the patch was already applied, it no-ops.
 *   - If the exact source pattern can't be found, it warns loudly
 *     (build would otherwise silently ship without coexistence) but
 *     does NOT break the install — the package still works for the
 *     plain Embedded Signup flow.
 *
 * Run automatically after `npm install` (see package.json "postinstall").
 * Run manually: node scripts/patch-whatsapp-embedded-signup.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(
  root,
  'node_modules',
  'react-whatsapp-embedded-signup',
  'dist',
  'index.js',
)

// Exact source fragment in the compiled bundle.
const OLD =
  'extras:{setup:p!=null?p:{},featureType:"",sessionInfoVersion:"3"}'

// featureType lifted from the user's `extras` option; falls back to "".
const NEW =
  'extras:{setup:p!=null?p:{},featureType:(p&&p.featureType)?p.featureType:"",sessionInfoVersion:"3"}'

let source
try {
  source = readFileSync(target, 'utf8')
} catch (err) {
  console.warn(
    '[patch-whatsapp-embedded-signup] Could not read package build:',
    err instanceof Error ? err.message : String(err),
  )
  process.exit(0)
}

if (source.includes(NEW)) {
  console.log('[patch-whatsapp-embedded-signup] Already patched.')
  process.exit(0)
}

if (!source.includes(OLD)) {
  console.warn(
    '[patch-whatsapp-embedded-signup] Expected pattern not found — the package may have changed. ' +
      'WhatsApp Business App coexistence (featureType) will NOT be available until the patch matches.',
  )
  process.exit(0)
}

writeFileSync(target, source.replace(OLD, NEW), 'utf8')
console.log(
  '[patch-whatsapp-embedded-signup] Patched featureType passthrough for WhatsApp Business App coexistence.',
)