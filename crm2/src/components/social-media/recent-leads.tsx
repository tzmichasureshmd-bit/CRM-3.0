"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { leadStatusBadgeClassName, leadStatusLabel } from "@/lib/crm/lead-status";

export interface RecentLead {
  id: string;
  name: string | null;
  phone: string | null;
  sourcePlatform: string | null;
  pageName: string | null;
  instagramUsername: string | null;
  campaignName: string | null;
  leadStatus: string | null;
  createdAt: string | null;
}

const PLATFORM_STYLES: Record<string, { bg: string; text: string; border: string; label: string; abbr: string; dot: string }> = {
  facebook:    { bg: 'bg-[#E8F1FE]', text: 'text-[#1565d8]', border: 'border-[#1877F2]/30', label: 'Facebook',  abbr: 'FB', dot: '#1877F2' },
  instagram:   { bg: 'bg-[#FEE8F0]', text: 'text-[#c0185a]', border: 'border-[#E1306C]/30', label: 'Instagram', abbr: 'IG', dot: '#E1306C' },
  whatsapp:    { bg: 'bg-[#E8FBF0]', text: 'text-[#1a9e4e]', border: 'border-[#25D366]/30', label: 'WhatsApp',  abbr: 'WA', dot: '#25D366' },
  telegram:    { bg: 'bg-[#E8F6FD]', text: 'text-[#1a8fc4]', border: 'border-[#26A5E4]/30', label: 'Telegram',  abbr: 'TG', dot: '#26A5E4' },
  google_form: { bg: 'bg-[#FFFBEA]', text: 'text-[#b45309]', border: 'border-[#f59e0b]/30', label: 'Google Form', abbr: 'GF', dot: '#f59e0b' },
  website:     { bg: 'bg-[#F3F0FF]', text: 'text-[#6d28d9]', border: 'border-[#7C3AED]/30', label: 'Website',   abbr: 'WB', dot: '#7C3AED' },
  manual:      { bg: 'bg-[#F1F5F9]', text: 'text-[#475569]', border: 'border-[#94a3b8]/30', label: 'Manual',    abbr: 'MN', dot: '#94a3b8' },
}

function SourceBadge({ platform }: { platform?: string | null }) {
  if (!platform) return null;
  const s = PLATFORM_STYLES[platform.toLowerCase()]
  if (!s) return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
      {platform}
    </span>
  )
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${s.bg} ${s.text} ${s.border}`}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {s.label}
    </span>
  )
}

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  return (
    <span className={leadStatusBadgeClassName(status)}>
      {leadStatusLabel(status)}
    </span>
  );
}

export function RecentLeads({ leads, loading }: { leads: RecentLead[]; loading?: boolean }) {
  if (loading && leads.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (leads.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No leads yet. Connect Facebook / Instagram to start capturing leads.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[#E4E8EF]">
      {leads.map((lead) => {
        const platform = lead.sourcePlatform?.toLowerCase()
        const account = platform === "instagram"
          ? (lead.instagramUsername ? `@${lead.instagramUsername}` : "Instagram")
          : platform === "facebook"
          ? (lead.pageName ?? "Facebook")
          : platform === "whatsapp"
          ? "WhatsApp"
          : platform === "telegram"
          ? "Telegram"
          : (lead.pageName ?? lead.sourcePlatform ?? "")
        return (
          <li key={lead.id}>
            <Link
              href={`/contacts/${lead.id}`}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted"
            >
              {/* Avatar circle with platform color */}
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-[11px] font-bold"
                style={{ background: PLATFORM_STYLES[platform ?? '']?.dot ?? '#94a3b8' }}
              >
                {(lead.name || 'U').charAt(0).toUpperCase()}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-foreground">
                    {lead.name || "Unnamed lead"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                    <SourceBadge platform={lead.sourcePlatform} />
                    {account && <span className="truncate">{account}</span>}
                    {lead.campaignName && (
                      <span className="hidden truncate sm:inline text-muted-foreground">· {lead.campaignName}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge status={lead.leadStatus} />
                <span className="text-[10px] text-muted-foreground">
                  {lead.createdAt ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true }) : ""}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
