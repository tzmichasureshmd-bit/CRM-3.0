"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  ThumbsUp,
  Camera,
  Link2,
  RefreshCw,
  AlertTriangle,
  Settings2,
  Unlink,
  Download,
} from "lucide-react";
import { LeadStatCards, type LeadStats } from "@/components/social-media/lead-stat-cards";
import { RecentLeads, type RecentLead } from "@/components/social-media/recent-leads";

interface OverviewPayload {
  stats: LeadStats;
  breakdown: {
    facebookTotal: number;
    instagramTotal: number;
    byFacebookPage: { label: string; count: number }[];
    byInstagramAccount: { label: string; count: number }[];
  };
  sourceSummary: {
    facebook: number;
    instagram: number;
    whatsapp: number;
    google_form: number;
    website: number;
    manual: number;
  };
  connections: {
    id?: string;
    pageId: string;
    pageName: string | null;
    platform: string;
    status: string;
    webhookStatus: string | null;
    instagramAccountId: string | null;
    instagramUsername: string | null;
  }[];
  recentLeads: RecentLead[];
}

function StatusPill({ connected, error }: { connected: boolean; error?: boolean }) {
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400">
        <AlertTriangle className="size-3" /> Connection Error
      </span>
    );
  }
  return connected ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
      <span className="flex h-1.5 w-1.5">
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
      Not Connected
    </span>
  );
}

export default function SocialMediaPage() {
  return (
    <Suspense fallback={null}>
      <SocialMediaContent />
    </Suspense>
  );
}

/** Safe, user-presentable OAuth failure messages. See callback/route.ts. */
const REASON_MESSAGES: Record<string, string> = {
  exchange_code: "Meta connection failed. Please try again.",
  discover_pages: "Meta connection failed. Please try again.",
  subscribe_page:
    "The Pages were connected, but one or more could not be subscribed to the lead webhook. You can retry from Settings.",
  meta_error: "Meta connection failed. Please try again.",
};

function SocialMediaContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // Default to true so a failed /failure of the config endpoint never shows
  // a false alarm; it flips to false only on an explicit server response.
  const [metaConfigured, setMetaConfigured] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, configRes] = await Promise.all([
        fetch("/api/social-media/overview", { cache: "no-store" }),
        fetch("/api/meta/leads/config", { cache: "no-store" }),
      ]);
      const overview = overviewRes.ok ? await overviewRes.json() : null;
      const config = configRes.ok ? await configRes.json() : null;
      setMetaConfigured(config?.metaConfigured !== false);
      const connections = overview?.connections ?? config?.connections ?? [];
      setData({
        stats:
          overview?.stats ??
          {
            total_leads: 0,
            new_leads: 0,
            facebook_leads: 0,
            instagram_leads: 0,
            today_leads: 0,
            month_leads: 0,
          },
        breakdown:
          overview?.breakdown ??
          { facebookTotal: 0, instagramTotal: 0, byFacebookPage: [], byInstagramAccount: [] },
        sourceSummary:
          overview?.sourceSummary ??
          { facebook: 0, instagram: 0, whatsapp: 0, google_form: 0, website: 0, manual: 0 },
        connections,
        recentLeads: overview?.recentLeads ?? [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Surface the outcome of an OAuth redirect (single loopback from the
  // Meta callback). Never echoes raw error strings — configuration issues
  // become a professional banner; everything else a short toast.
  useEffect(() => {
    const status = searchParams.get("meta_leads");
    if (!status) return;

    if (status === "connected") {
      toast.success("Meta connection successful");
      void load();
    } else if (status === "denied") {
      toast.error("You declined the connection with Meta");
    } else if (status === "connection_error" || status === "error") {
      toast.error(
        REASON_MESSAGES[searchParams.get("reason") ?? "meta_error"] ??
          "Meta connection failed. Please try again.",
      );
    } else if (status === "no_pages" || status === "error_no_pages") {
      toast.error(
        "We could not find a Facebook Page on this account. You need to be an admin of at least one Facebook Page.",
      );
    } else if (status === "config_error") {
      toast.error(
        "Meta isn't configured on this server yet. Ask your administrator to set META_APP_ID and META_APP_SECRET.",
      );
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("meta_leads");
    url.searchParams.delete("reason");
    url.searchParams.delete("pages");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const disconnect = useCallback(
    async (platform: "facebook" | "instagram", pageId: string) => {
      const res = await fetch("/api/meta/leads/config", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, platform }),
      });
      if (res.ok) {
        toast.success(`${platform === "facebook" ? "Facebook" : "Instagram"} connection removed`);
        void load();
      } else {
        toast.error("Could not remove the connection. Please try again.");
      }
    },
    [load],
  );

  const facebookConnections = (data?.connections ?? []).filter((c) => c.platform === "facebook");
  const instagramConnections = (data?.connections ?? []).filter((c) => c.platform === "instagram");
  const facebookConnected = facebookConnections.length > 0;
  const instagramConnected = instagramConnections.length > 0;
  const instagramAccount = instagramConnections[0]?.instagramUsername
    ? `@${instagramConnections[0].instagramUsername}`
    : null;

  // Manual "Sync now" — re-pulls recent leads from Meta through the same
  // idempotent pipeline the webhook uses (meta_lead_events dedupes).
  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/meta/leads/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(payload?.error ?? "Sync failed. Please try again.");
        return;
      }
      const created = payload?.created ?? 0;
      const updated = payload?.updated ?? 0;
      const duplicates = payload?.duplicates ?? 0;
      const errors = payload?.errors ?? 0;
      toast.success(
        `Sync complete — ${created} new, ${updated} updated, ${duplicates} already known${errors > 0 ? `, ${errors} error(s)` : ""}.`,
      );
      void load();
    } catch (err) {
      console.error("Meta sync failed:", err);
      toast.error("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Social Media Lead Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your Facebook and Instagram accounts and automatically capture advertising leads into
          your CRM.
        </p>
      </div>

      {/* Meta config warning (server-side env state, no secrets exposed) */}
      {!metaConfigured && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Meta integration not configured</p>
            <p className="text-amber-300/80">
              Facebook and Instagram Lead Ads require
              <code className="mx-1 rounded bg-amber-950/60 px-1.5 py-0.5 font-mono text-[11px]">META_APP_ID</code>
              and
              <code className="ml-1 rounded bg-amber-950/60 px-1.5 py-0.5 font-mono text-[11px]">META_APP_SECRET</code>
              on the server. Ask your administrator to set these environment
              variables, then come back here and connect.
            </p>
            <Link
              href="/integrations"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-200 underline underline-offset-2 hover:text-amber-100"
            >
              View all integrations
            </Link>
          </div>
        </div>
      )}

      {/* Lead Overview */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Lead Overview</h2>
          {facebookConnected && (
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
              title="Pull recent leads from Meta manually (already-synced leads are skipped)"
            >
              {syncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
        <LeadStatCards stats={data?.stats ?? null} loading={loading} />
      </section>

      {/* Connected accounts */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Facebook card */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <ThumbsUp className="size-5 text-[#1877F2]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Facebook Lead Ads</h3>
                <p className="text-xs text-muted-foreground">Capture leads from your Facebook Pages</p>
              </div>
            </div>
            <StatusPill connected={facebookConnected} />
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : facebookConnected ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  Facebook Connected
                </p>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  {facebookConnections.map((c) => (
                    <p key={`${c.pageId}-${c.platform}`} className="text-sm text-foreground">
                      <span className="text-xs text-muted-foreground">Page:</span>{" "}
                      {c.pageName ?? c.pageId}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.webhookStatus === "active" ? "Webhook active" : "Webhook pending"}
                      </span>
                    </p>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href="/settings?tab=meta-leads"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <Settings2 className="size-3.5" /> Manage
                  </Link>
                  <button
                    type="button"
                    onClick={() => disconnect("facebook", facebookConnections[0].pageId)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-red-400"
                  >
                    <Unlink className="size-3.5" /> Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Connect your Facebook account to discover your Pages and start receiving lead ads.
              </p>
            )}
          </div>

          {!facebookConnected && (
            <Link
              href="/social-media/connect?platform=facebook"
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Link2 className="size-4" />
              Connect Facebook
            </Link>
          )}
          {facebookConnected && (
            <Link
              href="/social-media/connect?platform=facebook"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              <RefreshCw className="size-4" />
              Reconnect / Refresh Pages
            </Link>
          )}
        </div>

        {/* Instagram card */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10">
                <Camera className="size-5 text-pink-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Instagram Lead Ads</h3>
                <p className="text-xs text-muted-foreground">Instagram Professional account</p>
              </div>
            </div>
            <StatusPill connected={instagramConnected} />
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : instagramConnected && instagramAccount ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  Instagram Connected
                </p>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-sm text-foreground">
                    <span className="text-xs text-muted-foreground">Account:</span>{" "}
                    {instagramAccount}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href="/settings?tab=meta-leads"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <Settings2 className="size-3.5" /> Manage
                  </Link>
                  <button
                    type="button"
                    onClick={() => disconnect("instagram", instagramConnections[0].pageId)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-red-400"
                  >
                    <Unlink className="size-3.5" /> Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Instagram lead ads are delivered through a Facebook Page. When the connected Page has a
                linked Instagram Professional account, it is discovered automatically — no separate
                login needed.
              </p>
            )}
          </div>

          {instagramConnected ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400">
              Capturing Instagram leads via Facebook connection
            </div>
          ) : (
            <Link
              href="/social-media/connect?platform=instagram"
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              <Camera className="size-4" />
              Connect Instagram via Facebook
            </Link>
          )}
        </div>
      </section>

      {/* Lead Sources */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Lead Sources</h2>
          <Link href="/contacts?source=meta" className="text-xs font-medium text-primary hover:underline">
            View all contacts
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <SourceList
              title="Facebook"
              total={data?.breakdown.facebookTotal ?? 0}
              href="/contacts?source=facebook"
              colorClass="text-blue-500"
              items={data?.breakdown.byFacebookPage ?? []}
            />
            <SourceList
              title="Instagram"
              total={data?.breakdown.instagramTotal ?? 0}
              href="/contacts?source=instagram"
              colorClass="text-pink-500"
              items={data?.breakdown.byInstagramAccount ?? []}
            />
            <SourceList
              title="WhatsApp"
              total={data?.sourceSummary.whatsapp ?? 0}
              href="/contacts?source=whatsapp"
              colorClass="text-emerald-500"
              items={[]}
            />
            <SourceList
              title="Google Form"
              total={data?.sourceSummary.google_form ?? 0}
              href="/contacts?source=google_form"
              colorClass="text-amber-500"
              items={[]}
            />
            <SourceList
              title="Website"
              total={data?.sourceSummary.website ?? 0}
              href="/contacts?source=website"
              colorClass="text-violet-500"
              items={[]}
            />
            <SourceList
              title="Manual"
              total={data?.sourceSummary.manual ?? 0}
              href="/contacts?source=manual"
              colorClass="text-slate-400"
              items={[]}
            />
          </div>
        )}
      </section>

      {/* Recent Leads */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent Leads</h2>
          <Link href="/contacts?tab=meta_leads" className="text-xs font-medium text-primary hover:underline">
            View all leads
          </Link>
        </div>
        <RecentLeads leads={data?.recentLeads ?? []} loading={loading} />
      </section>
    </div>
  );
}

function SourceList({
  title,
  total,
  href,
  colorClass,
  items,
}: {
  title: string;
  total: number;
  href: string;
  colorClass: string;
  items: { label: string; count: number }[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <Link href={href} className={`text-xl font-bold tabular-nums transition-opacity hover:opacity-80 ${colorClass}`}>
          {total.toLocaleString()} <span className="text-xs font-medium text-muted-foreground">leads</span>
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {total === 0 ? "No leads from this source yet." : "All leads from this source."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
            >
              <span className="truncate text-foreground">{item.label}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {item.count.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}