"use client";

import { Loader2, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import type { RecentConversation } from "@/lib/dashboard/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface RecentConversationsCardProps {
  conversations: RecentConversation[];
  loading: boolean;
}

const PLATFORM_CONFIG: Record<string, { bg: string; label: string }> = {
  instagram: { bg: "linear-gradient(135deg,#E1306C,#f77737)", label: "Instagram" },
  facebook:  { bg: "linear-gradient(135deg,#1877F2,#4a9af5)", label: "Facebook"  },
  telegram:  { bg: "linear-gradient(135deg,#26A5E4,#5bc8f5)", label: "Telegram"  },
  whatsapp:  { bg: "linear-gradient(135deg,#25D366,#128C7E)", label: "WhatsApp"  },
}

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'whatsapp': return (
      <svg viewBox="0 0 24 24" fill="white" width="9" height="9">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.845L.057 23.5l5.797-1.522A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.36-.214-3.717.976.993-3.63-.234-.373A9.818 9.818 0 1112 21.818z"/>
      </svg>
    );
    case 'facebook': return (
      <svg viewBox="0 0 24 24" fill="white" width="9" height="9">
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
      </svg>
    );
    case 'instagram': return (
      <svg viewBox="0 0 24 24" fill="white" width="9" height="9">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    );
    case 'telegram': return (
      <svg viewBox="0 0 24 24" fill="white" width="9" height="9">
        <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    );
    default: return null;
  }
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#3462EE,#5b7ff5)",
  "linear-gradient(135deg,#10b981,#34d399)",
  "linear-gradient(135deg,#f59e0b,#fbbf24)",
  "linear-gradient(135deg,#7c3aed,#a78bfa)",
  "linear-gradient(135deg,#E1306C,#f77737)",
  "linear-gradient(135deg,#1877F2,#4a9af5)",
]

export function RecentConversationsCard({
  conversations,
  loading,
}: RecentConversationsCardProps) {
  const t = useTranslations("Dashboard.page");

  const displayName = (c: RecentConversation) =>
    c.contact?.name || c.contact?.phone || t("unknown");

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "•";

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-36 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">{t("noRecentConversations")}</p>
        <p className="text-xs text-muted-foreground">{t("noRecentConversationsDesc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {conversations.map((conv, idx) => {
        const name = displayName(conv);
        const platform = conv.platform?.toLowerCase() ?? "whatsapp";
        const pCfg = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.whatsapp;
        const avatarGrad = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];
        const isUnread = conv.unread_count > 0;

        return (
          <button
            key={conv.id}
            onClick={() => { window.location.href = `/inbox?c=${conv.id}`; }}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
          >
            {/* Avatar with gradient + platform badge */}
            <div className="relative shrink-0">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-white text-xs font-bold"
                style={{ background: avatarGrad }}
              >
                {conv.contact?.avatar_url ? (
                  <img
                    src={conv.contact.avatar_url}
                    alt={name}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  initials(name)
                )}
              </div>
              {/* Platform badge */}
              <div
                className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-card"
                style={{ background: pCfg.bg }}
              >
                <PlatformIcon platform={platform} />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1">
                <span className={`truncate text-[13px] font-semibold text-foreground ${isUnread ? 'font-bold' : ''}`}>
                  {name}
                </span>
                {conv.last_message_at && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false })}
                  </span>
                )}
              </div>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                {conv.last_message_text || t("noMessagesYet")}
              </p>
            </div>

            {/* Unread dot */}
            {isUnread && (
              <span className="shrink-0 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
