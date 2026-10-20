"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Send, CheckCircle2, AlertTriangle, Unlink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BotStatus {
  id: string;
  bot_id: number | null;
  bot_username: string | null;
  bot_name: string | null;
  status: "connected" | "disconnected" | "error";
  webhook_url: string | null;
  webhook_set_at: string | null;
  last_webhook_at: string | null;
  last_inbound_at: string | null;
  connected_at: string | null;
}

export function TelegramSettings() {
  const [bot, setBot] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/telegram/connect", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBot(data.bot);
      }
    } catch (err) {
      console.error("Failed to load Telegram bot status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    if (!token.trim()) {
      toast.error("Enter your bot token from @BotFather.");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch("/api/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to connect Telegram bot.");
        return;
      }
      toast.success(`Connected @${data.bot.username ?? data.bot.name}`);
      setToken("");
      void load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      const res = await fetch("/api/telegram/connect", { method: "DELETE" });
      if (res.ok) {
        toast.success("Telegram bot disconnected.");
        void load();
      } else {
        toast.error("Failed to disconnect.");
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = bot?.status === "connected";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Telegram Bot</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a Telegram bot to receive and reply to Telegram DMs in the shared inbox.
          Create a bot with{" "}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            @BotFather
          </a>{" "}
          and paste the token below.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : isConnected && bot ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {bot.bot_name}
                {bot.bot_username ? ` (@${bot.bot_username})` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Webhook: {bot.webhook_url ?? "—"}
              </p>
              {bot.last_inbound_at && (
                <p className="text-xs text-muted-foreground">
                  Last message: {new Date(bot.last_inbound_at).toLocaleString()}
                </p>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
          </div>

          <div className="flex gap-2">
            <Link
              href="/inbox?channel=telegram"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Send className="size-3.5" /> Open Inbox
            </Link>
            <button
              type="button"
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-red-400 disabled:opacity-50"
            >
              {disconnecting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Unlink className="size-3.5" />
              )}
              Disconnect
            </button>
          </div>

          {/* Disconnect confirmation dialog */}
          <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Disconnect Telegram?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This will stop new messages and sending from this channel. Existing CRM contacts, conversations, and message history will be preserved.
              </p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setConfirmDisconnect(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void disconnect()}
                  disabled={disconnecting}
                >
                  {disconnecting ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                  Disconnect
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <div className="space-y-4">
          {bot?.status === "error" && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <AlertTriangle className="size-4 shrink-0" />
              Bot connection error. Reconnect below.
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Bot Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") void connect();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Get this from{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                @BotFather
              </a>{" "}
              → /newbot or /mybots → API Token. Never share this token.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void connect()}
            disabled={connecting || !token.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {connecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {connecting ? "Connecting…" : "Connect Telegram Bot"}
          </button>

          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Setup instructions</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Open Telegram and message @BotFather</li>
              <li>Send /newbot and follow the prompts</li>
              <li>Copy the API token BotFather gives you</li>
              <li>Paste it above and click Connect</li>
              <li>The CRM will register the webhook automatically</li>
              <li>Customers can now DM your bot and messages appear in the inbox</li>
            </ol>
            <p className="text-xs">
              Webhook URL:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/api/telegram/webhook`
                  : "/api/telegram/webhook"}
              </code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
