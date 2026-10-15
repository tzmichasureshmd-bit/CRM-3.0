"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ThumbsUp, Camera, Link2, Unlink, RefreshCw, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface PageConnection {
  id: string;
  page_id: string;
  page_name: string | null;
  platform: "facebook" | "instagram";
  status: string;
  webhook_status: string | null;
  instagram_account_id: string | null;
  instagram_username: string | null;
  connected_at: string | null;
}

/** Safe, user-presentable messages for the OAuth failure codes emitted by
 * the callback. Technical details are logged server-side and never shown. */
const REASON_MESSAGES: Record<string, string> = {
  denied: "You declined the connection with Meta.",
  no_pages:
    "We could not find a Facebook Page on this account. You need to be an admin of at least one Facebook Page.",
  zero_pages:
    "We could not find a Facebook Page on this account. You need to be an admin of at least one Facebook Page.",
  meta_error: "Meta connection failed. Please try again.",
  exchange_code: "Meta connection failed. Please try again.",
  discover_pages: "Meta connection failed. Please try again.",
  subscribe_page:
    "The Pages were connected, but one or more could not be subscribed to the lead webhook.",
};

export function MetaLeadsConnect() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<PageConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/meta/leads/config", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setConnections(data.connections ?? []);
    } catch {
      toast.error("Could not load Meta connections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  // Surface the result of the OAuth redirect (loopback).
  useEffect(() => {
    const status = searchParams.get("meta_leads");
    const reason = searchParams.get("reason");
    if (!status) return;
    if (status === "connected") {
      toast.success("Facebook account connected");
      void fetchConnections();
    } else if (status === "denied") {
      toast.error("You declined the connection with Meta");
    } else if (status === "config_error") {
      toast.error(
        "Meta isn't configured on this server yet. Ask your administrator to set META_APP_ID and META_APP_SECRET, then try again.",
      );
    } else if (status === "error_no_pages") {
      toast.error(
        "We could not find a Facebook Page on this account. You need to be an admin of at least one Facebook Page.",
      );
    } else if (status === "error") {
      toast.error(REASON_MESSAGES[reason ?? "meta_error"] ?? "Meta connection failed. Please try again.");
    }
    // clean the query string
    const url = new URL(window.location.href);
    url.searchParams.delete("meta_leads");
    url.searchParams.delete("reason");
    url.searchParams.delete("pages");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const startConnect = () => {
    setConnecting(true);
    window.location.href = "/api/meta/leads/connect";
  };

  const disconnect = async (platform: "facebook" | "instagram", pageId: string) => {
    setConfirmDisconnect(null);
    const res = await fetch("/api/meta/leads/config", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, platform }),
    });
    if (res.ok) {
      toast.success("Connection removed");
      void fetchConnections();
    } else {
      toast.error("Could not remove connection");
    }
  };

  const [syncing, setSyncing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState<{ platform: "facebook" | "instagram"; pageId: string } | null>(null);

  // Re-pull recent leads from the connected Pages through the official
  // Graph API, reusing the same idempotent pipeline the webhook uses.
  // Safe after a disconnect/reconnect gap or a missed webhook delivery.
  const syncNow = async () => {
    if (syncing || connections.length === 0) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/meta/leads/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(
          data?.error ?? "Sync failed. Please try again.",
        );
        return;
      }
      const created = data?.created ?? 0;
      const updated = data?.updated ?? 0;
      const duplicates = data?.duplicates ?? 0;
      const errors = data?.errors ?? 0;
      toast.success(
        `Sync complete — ${created} new, ${updated} updated, ${duplicates} already known${errors > 0 ? `, ${errors} error(s)` : ""}.`,
      );
      void fetchConnections();
    } catch (err) {
      console.error("Meta sync failed:", err);
      toast.error("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const facebookPages = connections.filter(
    (c) => c.platform === "facebook" && !!c.page_id && c.status === "active",
  );
  const instagramAccounts = connections.filter(
    (c) =>
      c.platform === "instagram" &&
      c.status === "active" &&
      !!c.instagram_account_id &&
      !!c.instagram_username,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Facebook & Instagram Lead Ads
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a Facebook account to automatically turn lead ad
          submissions on your Pages (and linked Instagram Professional
          accounts) into CRM contacts. Leads appear in the Contacts page
          with their source, Page, campaign and form.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={
            facebookPages.length > 0 || instagramAccounts.length > 0
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-border text-muted-foreground"
          }
        >
          {facebookPages.length > 0 || instagramAccounts.length > 0 ? "Connected" : "Not connected"}
        </Badge>
        {(facebookPages.length > 0 || instagramAccounts.length > 0) && (
          <Badge
            variant="outline"
            className={
              [...facebookPages, ...instagramAccounts].some((c) => c.webhook_status === "active")
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400"
            }
          >
            Webhook:
            {[...facebookPages, ...instagramAccounts].some((c) => c.webhook_status === "active")
              ? " Active"
              : " Pending"}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={startConnect} disabled={connecting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          {connecting ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
          Connect Facebook Account
        </Button>
        <Button
          variant="outline"
          onClick={() => void fetchConnections()}
          disabled={loading}
          className="border-border text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className="size-4" /> Refresh
        </Button>
        <Button
          variant="outline"
          onClick={() => void syncNow()}
          disabled={syncing || (facebookPages.length === 0 && instagramAccounts.length === 0)}
          className="border-border text-muted-foreground hover:bg-muted"
          title="Pull recent leads from Meta manually (idempotent — already-synced leads are skipped)"
        >
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {facebookPages.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ThumbsUp className="size-4 text-[#1877F2]" /> Connected Pages
              </h3>
              {facebookPages.map((p) => (
                <PageRow key={p.id} conn={p} onDisconnect={() => setConfirmDisconnect({ platform: "facebook", pageId: p.page_id })} />
              ))}
            </div>
          )}

          {instagramAccounts.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Camera className="size-4 text-pink-500" /> Instagram Accounts
              </h3>
              {instagramAccounts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Camera className="size-4 text-pink-500" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        @{p.instagram_username}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.page_name ?? "Instagram Professional account"}
                      </p>
                      {p.instagram_account_id && (
                        <p className="text-[10px] font-mono text-muted-foreground">ID: {p.instagram_account_id}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDisconnect({ platform: "instagram", pageId: p.page_id })}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    <Unlink className="size-4" /> Disconnect
                  </Button>
                </div>
              ))}
            </div>
          )}

          {facebookPages.length === 0 && instagramAccounts.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">
              No Meta pages connected yet. Click “Connect Facebook Account”
              to get started.
            </p>
          )}
        </>
      )}

      {/* Disconnect confirmation dialog */}
      <Dialog open={!!confirmDisconnect} onOpenChange={(open) => { if (!open) setConfirmDisconnect(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Disconnect {confirmDisconnect?.platform === "instagram" ? "Instagram" : "Facebook"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will stop new messages and leads from this channel. Existing CRM contacts, conversations, and message history will be preserved.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDisconnect(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDisconnect && void disconnect(confirmDisconnect.platform, confirmDisconnect.pageId)}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageRow({
  conn,
  onDisconnect,
}: {
  conn: PageConnection;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <ThumbsUp className="size-4 text-[#1877F2]" />
        <div>
          <p className="text-sm font-medium text-foreground">{conn.page_name ?? conn.page_id}</p>
          <p className="text-xs text-muted-foreground">
            {conn.instagram_username ? `Insta: @${conn.instagram_username} · ` : ""}
            {conn.connected_at
              ? `Connected ${new Date(conn.connected_at).toLocaleDateString()}`
              : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-border text-muted-foreground">
          {conn.webhook_status === "active" ? "Webhook active" : "Webhook pending"}
        </Badge>
        <Button variant="ghost" size="sm" onClick={onDisconnect} className="text-muted-foreground hover:text-red-400">
          <Unlink className="size-4" /> Disconnect
        </Button>
      </div>
    </div>
  );
}
