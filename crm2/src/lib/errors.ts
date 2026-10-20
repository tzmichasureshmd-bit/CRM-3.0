// ============================================================
// Real error reporting for CRM 2.0
//
// Rule (CRM 2.0 §32 / §36): a failed action must show *why* it
// failed. "Failed." and "Failed to save." are not acceptable.
//
// Every Supabase/PostgREST failure carries a machine-readable
// `code`. This module turns those codes into a sentence a user can
// act on — and, when the failure is a missing table/column/function
// (i.e. the database has not been migrated yet), into a pointer at
// the exact migration that fixes it.
// ============================================================

export interface PostgrestLikeError {
  code?: string | null
  message?: string
  details?: string | null
  hint?: string | null
}

interface SchemaIssue {
  kind: "missing_table" | "missing_column" | "missing_function"
  /** Table / column / function name the API said it could not find. */
  name: string
  /** Migration that creates it, when we know which. */
  migration?: string
}

/**
 * Migrations that own the objects we most often probe for.
 *
 * `077_crm20_stabilization.sql` is the idempotent catch-up script: it
 * contains everything the CRM 2.0 acceptance criteria need, so most
 * keys point at it. Earlier migrations are listed only where they own
 * an object 077 does not recreate.
 */
const KNOWN_MIGRATIONS: Record<string, string> = {
  tickets: "077_crm20_stabilization.sql",
  ticket_comments: "051_automation_platform_upgrade.sql",
  media_assets: "077_crm20_stabilization.sql",
  preset_campaigns: "077_crm20_stabilization.sql",
  campaigns: "077_crm20_stabilization.sql",
  quick_replies: "077_crm20_stabilization.sql",
  payments: "046_saas_foundation_phase1.sql",
  webhook_endpoints: "048_repair_orphaned_tables.sql",
  ai_configs: "048_repair_orphaned_tables.sql",
  ai_usage_log: "048_repair_orphaned_tables.sql",
  ai_knowledge_documents: "048_repair_orphaned_tables.sql",
  ai_knowledge_chunks: "048_repair_orphaned_tables.sql",
  social_oauth_states: "074_threads_x_support.sql",
  next_ticket_number: "077_crm20_stabilization.sql",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Pull the PostgREST error out of whatever the caller hands us.
 * Supabase returns `{ error }` wrappers, throws `Error`s, and — from
 * the storage/GoTrue clients — plain strings.
 */
export function asPostgrestError(err: unknown): PostgrestLikeError | null {
  if (!err) return null
  if (isRecord(err)) {
    const nested = (err as { error?: unknown }).error
    if (isRecord(nested) && ("code" in nested || "message" in nested)) {
      return nested as PostgrestLikeError
    }
    if ("code" in err || "message" in err) return err as PostgrestLikeError
    return null
  }
  return null
}

function extractName(message: string, pattern: RegExp): string | null {
  const match = pattern.exec(message)
  return match?.[1] ?? null
}

/**
 * Detect "the database is missing this object" failures.
 * Returns null for ordinary business/validation errors.
 */
export function schemaIssue(err: unknown): SchemaIssue | null {
  const e = asPostgrestError(err)
  if (!e) return null
  const code = e.code ?? ""
  const message = (e.message ?? "").toLowerCase()

  // PostgREST: PGRST205 -> table not in schema cache
  if (code === "PGRST205" || message.includes("could not find the table")) {
    const name =
      extractName(e.message ?? "", /table 'public\.([a-zA-Z0-9_]+)'/i) ??
      extractName(e.message ?? "", /relation "public\.([a-zA-Z0-9_]+)"/i) ??
      "unknown"
    return { kind: "missing_table", name, migration: KNOWN_MIGRATIONS[name] }
  }

  // 42703 -> undefined_column
  if (code === "42703" || message.includes("does not exist")) {
    const columnMatch = /column ([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/i.exec(
      e.message ?? "",
    )
    if (columnMatch) {
      const table = columnMatch[1]
      const column = columnMatch[2]
      return {
        kind: "missing_column",
        name: `${table}.${column}`,
        migration: KNOWN_MIGRATIONS[table],
      }
    }
    if (code === "42703") {
      return { kind: "missing_column", name: e.message ?? "unknown" }
    }
    if (message.includes("relation") && message.includes("does not exist")) {
      const table = extractName(e.message ?? "", /relation "([a-zA-Z0-9_]+)"/i)
      if (table) {
        return { kind: "missing_table", name: table, migration: KNOWN_MIGRATIONS[table] }
      }
    }
  }

  // PGRST202 -> function not found
  if (code === "PGRST202" || message.includes("could not find the function")) {
    const fn = extractName(e.message ?? "", /function public\.([a-zA-Z0-9_]+)/i)
    if (fn) return { kind: "missing_function", name: fn, migration: KNOWN_MIGRATIONS[fn] }
  }

  return null
}

const MISSING_OBJECT_ADVICE =
  "Open Supabase → SQL Editor and run the migration listed below, then retry."

function adviceFor(issue: SchemaIssue): string {
  const what =
    issue.kind === "missing_table"
      ? `Table "${issue.name}" does not exist.`
      : issue.kind === "missing_column"
        ? `Column "${issue.name}" does not exist.`
        : `Database function "${issue.name}()" does not exist.`
  const migration = issue.migration
    ? ` Run supabase/migrations/${issue.migration}.`
    : " Check supabase/migrations/ for the migration that creates it."
  return `${what} ${MISSING_OBJECT_ADVICE}${migration}`
}

/**
 * Turn any thrown value into a user-facing sentence that keeps the
 * real reason. Never returns an empty string.
 */
export function describeError(
  err: unknown,
  fallback = "The operation could not be completed.",
): string {
  if (typeof err === "string" && err.trim()) return err.trim()

  const issue = schemaIssue(err)
  if (issue) return adviceFor(issue)

  const e = asPostgrestError(err)
  const code = e?.code ?? ""
  const message = (e?.message ?? "").trim()

  switch (code) {
    case "42501":
      return (
        "The database permission policy rejected this operation " +
        "(row-level security). Your role does not allow this change."
      )
    case "PGRST301":
      return "Your session has expired. Sign in again and retry."
    case "401":
    case "invalid_jwt":
      return "You are not signed in. Sign in again and retry."
    case "23505": {
      const detail = (e?.details ?? "").replace(/^Key /, "").replace(/\)$/, "")
      return detail
        ? `A record with these values already exists (${detail}).`
        : "A record with these values already exists."
    }
    case "23503":
      return `A related record is missing or still in use (${e?.details ?? message}).`
    case "23514":
      return `One of the values is not allowed by the database (${e?.details ?? message}).`
    case "23502":
      return `A required field was not provided (${e?.details ?? message}).`
    case "22P02":
      return `A value has the wrong format (${message}).`
    case "PGRST116":
      return "The record you tried to change was not found. It may have been deleted."
    case "PGRST204":
      return `The column you tried to use does not exist (${message}).`
  }

  if (/row-level security/i.test(message)) {
    return "The database permission policy rejected this operation (row-level security)."
  }
  if (/failed to fetch|networkerror|econnrefused/i.test(message)) {
    return "Could not reach the server. Check your connection and retry."
  }
  if (message) return message
  if (err instanceof Error && err.message) return err.message

  return fallback
}

/**
 * One-line console + toast payload. Keeps the stack in the console
 * (development visibility, CRM 2.0 §32) while showing the reason in
 * the UI.
 */
export function reportError(
  err: unknown,
  context: string,
  fallback = "The operation could not be completed.",
): string {
  const description = describeError(err, fallback)
  console.error(`[${context}]`, err)
  return description
}
