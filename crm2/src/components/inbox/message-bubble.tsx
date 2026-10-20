"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Message, MessageReaction } from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  FileText,
  MapPin,
  LayoutTemplate,
  ImageOff,
  CornerDownLeft,
  Sparkles,
  Info,
} from "lucide-react";
import { format } from "date-fns";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import { InteractivePreview } from "@/components/interactive/interactive-preview";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
  /** The conversation platform — used to cap Telegram status correctly. */
  platform?: string;
}

/**
 * Telegram Bot API only confirms the message was accepted by Telegram's
 * servers — it does NOT provide delivery or read receipts for bot messages.
 * Cap Telegram status at "sent" so we never show a false double-tick.
 */
function StatusIcon({
  status,
  platform,
  onClick,
  onPrimary = false,
}: {
  status: Message["status"];
  platform?: string;
  onClick?: () => void;
  /** True when rendered inside the `bg-primary` outbound bubble. */
  onPrimary?: boolean;
}) {
  const isTelegram = platform === "telegram";
  // For Telegram: treat delivered/read as sent — Bot API doesn't confirm these
  const effectiveStatus = isTelegram && (status === "delivered" || status === "read") ? "sent" : status;

  const icon = (() => {
    switch (effectiveStatus) {
      case "sending": return <Clock className="h-3 w-3 text-muted-foreground" />;
      case "sent":    return <Check className="h-3 w-3 text-muted-foreground" />;
      case "delivered": return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      // `read` and `failed` render on the `bg-primary` outbound bubble.
      // blue-400 / red-400 are light-palette hues that land around
      // 2.7:1 on the accent and, being fixed hex, ignored the selected
      // accent entirely. On a light bubble these are near-white anyway,
      // so branch on the bubble.
      case "read":    return <CheckCheck className={cn("h-3 w-3", onPrimary ? "text-primary-foreground/80" : "text-sky-500 dark:text-sky-400")} />;
      case "failed":  return <XCircle className={cn("h-3 w-3", onPrimary ? "text-primary-foreground/80" : "text-destructive")} />;
      default:        return null;
    }
  })();

  if (!icon) return null;
  if (!onClick) return icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center opacity-80 hover:opacity-100"
      aria-label="Message info"
    >
      {icon}
    </button>
  );
}

function MediaUnavailable({ label, t }: { label: string, t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{t("unavailable", { label })}</span>
    </div>
  );
}

function MediaImage({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadImage = useCallback(async () => {
    if (!url) return;

    // Proxy URLs need auth fetch to create blob URL
    if (url.startsWith("/api/whatsapp/media/")) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load media");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    } else {
      setSrc(url);
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    loadImage();
    return () => {
      if (src?.startsWith("blob:")) {
        URL.revokeObjectURL(src);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadImage]);

  if (error) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <img
      src={src ?? ""}
      alt={alt}
      className="max-h-64 max-w-60 rounded-lg object-cover"
      onError={() => setError(true)}
    />
  );
}

function MessageContent({ message, t }: { message: Message, t: ReturnType<typeof useTranslations> }) {
  // Soft-deleted messages render as a muted placeholder. The row + status
  // timestamp still render, so the thread structure isn't shifted.
  if (message.deleted_at) {
    return (
      <p className="text-sm italic text-muted-foreground">
        {t("deleted")}
      </p>
    );
  }

  switch (message.content_type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text}
        </p>
      );

    case "image":
      return (
        <div>
          {message.media_url ? (
            <MediaImage url={message.media_url} alt="Shared image" />
          ) : (
            <MediaUnavailable label={t("photo")} t={t} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "video":
      return (
        <div>
          {message.media_url ? (
            <video
              src={message.media_url}
              controls
              className="max-h-64 max-w-60 rounded-lg"
            />
          ) : (
            <MediaUnavailable label={t("video")} t={t} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "audio":
      return (
        <div>
          {message.media_url ? (
            <audio src={message.media_url} controls className="max-w-60" />
          ) : (
            <MediaUnavailable label={t("audio")} t={t} />
          )}
        </div>
      );

    case "document":
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || t("document")} t={t} />;
      }
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted"
        >
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {message.content_text || t("document")}
          </span>
        </a>
      );

    case "template":
      return (
        <div>
          {/* Templates are always agent-sent, so this badge lands
           *  inside the `bg-primary` bubble. `text-primary` on
           *  `bg-primary/20` over `bg-primary` is the same hue at the
           *  same lightness — roughly 1:1, i.e. invisible. The AI
           *  badge below already uses the correct `primary-foreground`
           *  pair; this one was missed. */}
          <span className="mb-1 inline-flex items-center gap-1 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
            <LayoutTemplate className="h-3 w-3" />
            {t("template")}
          </span>
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || t("locationShared")}</span>
        </div>
      );

    case "interactive": {
      // Three cases share content_type='interactive':
      //  - OUTBOUND with payload (composer / automation / Flow send after
      //    migration 035): render the buttons/list as they appear on the phone.
      //  - INBOUND tap (customer chose an option, sender_type='customer'):
      //    no payload; show the tapped option's title with a reply affordance
      //    so agents can tell it's a tap, not the customer typing.
      //  - OUTBOUND with NO payload (legacy bot/Flow sends from before
      //    migration 035 backfilled the column): show the body text plainly —
      //    it is our own message, NOT a customer tap.
      if (message.interactive_payload) {
        return <InteractivePreview payload={message.interactive_payload} />;
      }
      if (message.sender_type === "customer") {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <CornerDownLeft className="h-3 w-3" />
              {t("buttonReply")}
            </span>
            <p className="whitespace-pre-wrap break-words text-sm">
              {message.content_text || t("interactiveReply")}
            </p>
          </div>
        );
      }
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || t("interactiveReply")}
        </p>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || t("unsupported")}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
  platform,
}: MessageBubbleProps) {
  const t = useTranslations("Inbox.bubble");
  const [infoOpen, setInfoOpen] = useState(false);

  const isAgent = message.sender_type === "agent";
  const time = format(new Date(message.created_at), "HH:mm");
  const isTelegram = platform === "telegram";

  return (
    <>
      <div
        className={cn(
          "flex flex-col",
          isAgent ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "relative rounded-2xl px-3 py-2",
            isAgent
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md bg-muted text-foreground",
          )}
        >
          {reply && (
            <ReplyQuote
              authorLabel={reply.authorLabel}
              preview={reply.preview}
              onPrimary={isAgent}
            />
          )}
          <MessageContent message={message} t={t} />
          <div
            className={cn(
              "mt-1 flex items-center gap-1",
              isAgent ? "justify-end" : "justify-start",
            )}
          >
            {message.ai_generated && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-primary-foreground/20 px-1.5 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-primary-foreground"
                title={t("aiBadgeTitle")}
              >
                <Sparkles className="h-2.5 w-2.5" />
                {t("aiBadge")}
              </span>
            )}
            <span
              className={cn(
                "text-[10px]",
                isAgent ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
            >
              {time}
            </span>
            {isAgent && (
              <StatusIcon
                status={message.status}
                platform={platform}
                onPrimary={isAgent}
                onClick={isTelegram ? () => setInfoOpen(true) : undefined}
              />
            )}
            {/* Info button for non-Telegram outbound messages */}
            {isAgent && !isTelegram && (
              <button
                type="button"
                onClick={() => setInfoOpen(true)}
                className="flex items-center opacity-0 hover:opacity-80 group-hover/bubble:opacity-60"
                aria-label="Message info"
              >
                <Info className="h-2.5 w-2.5 text-primary-foreground/50" />
              </button>
            )}
          </div>
        </div>
        {reactions && reactions.length > 0 && onToggleReaction && (
          <MessageReactions
            reactions={reactions}
            currentUserId={currentUserId}
            onToggle={onToggleReaction}
          />
        )}
      </div>

      {/* Message Info Dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              {isTelegram ? (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[#2AABEE]/15 text-[#2AABEE]">TELEGRAM</span>
              ) : null}
              Message Info
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <InfoRow label="Direction" value={isAgent ? "Outgoing" : "Incoming"} />
            <InfoRow label="Type" value={isTelegram ? "Telegram message" : `${message.content_type} message`} />
            <InfoRow label="Sent" value={format(new Date(message.created_at), "MMM d, yyyy HH:mm:ss")} />
            <InfoRow label="Status" value={message.status} />
            {message.message_id && (
              <InfoRow label={isTelegram ? "Telegram Message ID" : "Message ID"} value={message.message_id} mono />
            )}
            {isTelegram && message.message_id && (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
                Telegram Bot API confirms message was accepted by Telegram’s servers. Delivery and read receipts are not available for bot messages.
              </p>
            )}
            {message.status === "failed" && (
              <InfoRow label="Failure reason" value="Message failed to send. Use Retry." />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("text-right text-foreground", mono && "font-mono text-xs break-all")}>{value}</span>
    </div>
  );
}
