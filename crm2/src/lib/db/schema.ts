"use client"

import type { SupabaseClient } from "@supabase/supabase-js"

// ============================================================
// Schema capability probes
//
// The CRM ships more migrations than every deployment has applied.
// Rather than hard-failing (or — worse — pretending a save worked),
// features probe once for the objects they need and either degrade
// cleanly or tell the operator exactly which migration to run.
//
// Results are memoised per client instance for the lifetime of the
// tab: schema shape does not change while the app is open.
// ============================================================

type Verdict = "yes" | "no"

const columnCache = new WeakMap<SupabaseClient, Map<string, Verdict>>()
const tableCache = new WeakMap<SupabaseClient, Map<string, Verdict>>()

function cacheFor<T>(root: WeakMap<SupabaseClient, T>, client: SupabaseClient): T {
  let map = root.get(client)
  if (!map) {
    map = new Map() as unknown as T
    root.set(client, map)
  }
  return map
}

/**
 * Does `<table>.<column>` exist? A `select` of just that column
 * returns 42703 when it does not, and 200 (empty) when it does.
 */
export async function hasColumn(
  client: SupabaseClient,
  table: string,
  column: string,
): Promise<boolean> {
  const cache = cacheFor(columnCache, client)
  const key = `${table}.${column}`
  const hit = cache.get(key)
  if (hit) return hit === "yes"

  const { error } = await client.from(table).select(column).limit(1)
  const verdict: Verdict = !error ? "yes" : "no"
  cache.set(key, verdict)
  return verdict === "yes"
}

/** Does `<table>` exist in the exposed schema? */
export async function hasTable(
  client: SupabaseClient,
  table: string,
): Promise<boolean> {
  const cache = cacheFor(tableCache, client)
  const hit = cache.get(table)
  if (hit) return hit === "yes"

  const { error } = await client.from(table).select("id").limit(1)
  const verdict: Verdict = !error || error.code !== "PGRST205" ? "yes" : "no"
  cache.set(table, verdict)
  return verdict === "yes"
}
