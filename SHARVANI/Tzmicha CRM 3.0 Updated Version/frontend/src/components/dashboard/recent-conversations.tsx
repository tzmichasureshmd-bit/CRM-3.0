"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

const CONVS = [
  { name: "Priya Sharma", msg: "Can you share the pricing details?", platform: "instagram", time: "2m", unread: 2, color: "#E1306C" },
  { name: "Rahul Mehta", msg: "I'm interested in your services.", platform: "whatsapp", time: "1m", unread: 1, color: "#25D366" },
  { name: "Sneha Kapoor", msg: "Do you have a demo?", platform: "facebook", time: "18m", unread: 0, color: "#1877F2" },
  { name: "Amit Verma", msg: "Can we schedule a call?", platform: "email", time: "25m", unread: 0, color: "#F59E0B" },
  { name: "Neha Singh", msg: "Looking forward to your response.", platform: "whatsapp", time: "32m", unread: 0, color: "#25D366" },
];

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "IG", whatsapp: "WA", facebook: "FB", email: "EM",
};

export function RecentConversations() {
  return (
    <div className="glass rounded-2xl p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold" style={{ color: "var(--color-foreground)" }}>Recent Conversations</h2>
        <Link href="/inbox" className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--brand-primary)" }}>
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-3">
        {CONVS.map((c) => (
          <Link key={c.name} href="/inbox"
            className="flex items-center gap-3 rounded-xl p-2 transition-all hover:bg-muted/50">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}>
              {c.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--color-foreground)" }}>{c.name}</p>
                <span className="text-[10px] shrink-0 ml-2" style={{ color: "var(--color-muted-foreground)" }}>{c.time}</span>
              </div>
              <p className="text-xs truncate" style={{ color: "var(--color-muted-foreground)" }}>{c.msg}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: c.color }}>
                {PLATFORM_ICONS[c.platform]}
              </span>
              {c.unread > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: "var(--brand-primary)" }}>
                  {c.unread}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
