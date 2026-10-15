"use client"

import { useState } from "react"
import { AlertTriangle, Check, Copy, Database, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// ============================================================
// SetupRequired — the "your database is missing this" banner.
//
// CRM 2.0 rule: a feature whose backing table/column does not exist
// must say so *exactly*, instead of throwing "Failed" or — worse —
// showing an empty list that looks like "you have no data".
//
// Usage:
//   <SetupRequired feature="Campaigns" migration="077_crm20_stabilization.sql"
//     missing="Table public.campaigns does not exist yet." />
//
// It renders an amber panel with:
//   - what is missing
//   - the exact migration file to run
//   - a copy button for the file name
//   - a link straight to the Supabase SQL Editor
// ============================================================

interface SetupRequiredProps {
  /** Human name of the feature that cannot work yet. */
  feature: string
  /** Migration file inside supabase/migrations/. */
  migration?: string
  /** Precise description of what the database is missing. */
  missing?: string
  className?: string
  /** Render inline (inside an existing card) instead of a full panel. */
  compact?: boolean
}

const DEFAULT_MIGRATION = "077_crm20_stabilization.sql"

function sqlEditorUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1]
  return ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : null
}

export function SetupRequired({
  feature,
  migration = DEFAULT_MIGRATION,
  missing,
  className,
  compact = false,
}: SetupRequiredProps) {
  const [copied, setCopied] = useState(false)
  const dashboard = sqlEditorUrl()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(migration)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable (non-secure context) — file name is visible anyway */
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-500/40 bg-amber-500/10",
        compact ? "p-4" : "p-5",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {feature} needs a database migration
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {missing ??
              `The required database objects for ${feature} are not present in this project.`}{" "}
            Nothing was saved. Run the migration below and this page will work
            without any code changes.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-background px-2 py-1 font-mono text-[11px] text-foreground">
              <Database className="h-3 w-3 text-amber-500" />
              supabase/migrations/{migration}
            </code>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-amber-500/30 bg-transparent text-[11px]"
              onClick={copy}
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copied" : "Copy file name"}
            </Button>

            {dashboard && (
              <a
                href={dashboard}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-500/30 px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-amber-500/10"
              >
                Open SQL Editor
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            Dashboard → SQL Editor → New query → paste the file → Run. It is
            idempotent and only adds objects, so it is safe on any project.
          </p>
        </div>
      </div>
    </div>
  )
}
