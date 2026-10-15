"use client"

// Super Admin → Settings → Lead Alerts.
//
// Configures the automatic two-person "new lead" email notifications:
// enable/disable the feature, set the two recipient addresses, brand
// the From envelope, save, and send a live test email.

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { PlatformLeadNotificationSettings } from "@/types"
import { BellRing, Send, LoaderCircle, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react"

const DEFAULT_SETTINGS: PlatformLeadNotificationSettings = {
  id: 1,
  enabled: false,
  recipient_1_email: "",
  recipient_2_email: "",
  from_email: "no-reply@tzmicha.com",
  from_name: "Tzmicha",
  updated_at: new Date().toISOString(),
}

export function SuperAdminLeadNotificationSettings() {
  const [settings, setSettings] = useState<PlatformLeadNotificationSettings>(DEFAULT_SETTINGS)
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/admin/lead-notifications/config")
      const body = (await res.json()) as {
        settings?: PlatformLeadNotificationSettings | null
        emailProviderConfigured?: boolean
        error?: string
      }
      if (!res.ok) {
        setError(body.error ?? "Failed to load lead alert settings")
        return
      }
      if (body.settings) setSettings({ ...DEFAULT_SETTINGS, ...body.settings })
      setProviderConfigured(!!body.emailProviderConfigured)
      setDirty(false)
    } catch {
      setError("Failed to load lead alert settings")
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const patch = <K extends keyof PlatformLeadNotificationSettings>(key: K, value: PlatformLeadNotificationSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
    setError(null)
    setTestResult(null)
  }

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch("/api/admin/lead-notifications/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings.enabled,
          recipient_1_email: settings.recipient_1_email,
          recipient_2_email: settings.recipient_2_email,
          from_email: settings.from_email,
          from_name: settings.from_name,
        }),
      })
      const body = (await res.json()) as {
        settings?: PlatformLeadNotificationSettings | null
        error?: string
      }
      if (!res.ok) {
        setError(body.error ?? "Failed to save settings")
        return
      }
      if (body.settings) setSettings({ ...DEFAULT_SETTINGS, ...body.settings })
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }, [settings])

  const sendTest = useCallback(async () => {
    setTesting(true)
    setError(null)
    setTestResult(null)
    try {
      const res = await fetch("/api/admin/lead-notifications/test", { method: "POST" })
      const body = (await res.json()) as {
        ok?: boolean
        error?: string
        results?: Array<{ ok: boolean; to: string; error?: string | null }>
      }
      if (!res.ok || !body.ok) {
        setTestResult(`Test failed: ${body.error ?? "unknown error"}`)
        return
      }
      const recipients = (body.results ?? []).map((r) => r.to).join(", ")
      setTestResult(`Test email sent to ${recipients}`)
    } catch {
      setTestResult("Test failed: request error")
    } finally {
      setTesting(false)
    }
  }, [])

  const recipientsConfigured =
    !!settings.recipient_1_email?.trim() || !!settings.recipient_2_email?.trim()

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-muted-foreground" />
          Lead Alerts
        </CardTitle>
        <CardDescription>
          Automatic two-person email notifications whenever a genuinely new lead arrives from
          any source (WhatsApp, Google Forms, Meta/Facebook/Instagram, manual entry, campaign,
          automation). Configure recipients and branding below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!loaded && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading…
          </div>
        )}

        {loaded && (
          <>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">New-lead notifications</p>
                <p className="text-xs text-muted-foreground">
                  Enqueue and email two recipients whenever a new lead is created.
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(enabled) => patch("enabled", enabled)}
              />
            </div>

            {/* Provider status */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Email provider (Resend)</span>
              {providerConfigured === null ? (
                <Badge variant="outline" className="text-muted-foreground">Checking…</Badge>
              ) : providerConfigured ? (
                <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Configured</Badge>
              ) : (
                <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-500">Not configured</Badge>
              )}
              {providerConfigured === false && (
                <span className="w-full text-xs text-amber-600 dark:text-amber-400">
                  Set <code className="rounded bg-muted px-1 py-0.5 font-mono">RESEND_API_KEY</code> in your server
                  environment to send emails. Without it, alerts stay queued as pending.
                </span>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recipient-1">Recipient 1</Label>
                <Input
                  id="recipient-1"
                  type="email"
                  placeholder="manager@tzmicha.com"
                  value={settings.recipient_1_email ?? ""}
                  onChange={(e) => patch("recipient_1_email", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">First person to be notified of every new lead.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipient-2">Recipient 2</Label>
                <Input
                  id="recipient-2"
                  type="email"
                  placeholder="sales@tzmicha.com"
                  value={settings.recipient_2_email ?? ""}
                  onChange={(e) => patch("recipient_2_email", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Second person to be notified of every new lead.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="from-name">From name</Label>
                <Input
                  id="from-name"
                  value={settings.from_name}
                  onChange={(e) => patch("from_name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="from-email">From email (verified in Resend)</Label>
                <Input
                  id="from-email"
                  type="email"
                  value={settings.from_email}
                  onChange={(e) => patch("from_email", e.target.value)}
                />
              </div>
            </div>

            {!settings.enabled && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p>
                    Notifications are currently <b>disabled</b>. New leads will not trigger alerts.
                    Enable the switch and save to start sending.
                  </p>
                  {!recipientsConfigured && providerConfigured !== false && (
                    <p className="mt-1">No recipients configured — add at least one before enabling.</p>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </div>
            )}
            {saved && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                Settings saved.
              </div>
            )}
            {testResult && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-3 text-sm",
                  testResult.startsWith("Test failed")
                    ? "border-destructive/40 bg-destructive/5 text-destructive"
                    : "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
                )}
              >
                {testResult.startsWith("Test failed") ? (
                  <AlertTriangle className="size-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="size-4 shrink-0" />
                )}
                {testResult}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void save()} disabled={saving || !dirty}>
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                {saving ? "Saving…" : "Save settings"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void sendTest()}
                disabled={testing || !recipientsConfigured}
              >
                {testing ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                {testing ? "Sending…" : "Send test email"}
              </Button>
              <Button variant="ghost" onClick={() => void load()}>
                <RefreshCw className="size-4" />
                Reset
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}