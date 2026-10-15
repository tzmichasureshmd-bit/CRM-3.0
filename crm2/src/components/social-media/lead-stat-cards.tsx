"use client";

import Link from "next/link";
import { Loader2, UsersRound, Sparkles, ArrowUpRight } from "lucide-react";

export interface LeadStats {
  total_leads: number;
  new_leads: number;
  facebook_leads: number;
  instagram_leads: number;
  today_leads: number;
  month_leads: number;
}

function hrefFor(kind: string): string {
  switch (kind) {
    case "total":     return "/contacts?tab=meta_leads";
    case "new":       return "/contacts?tab=new_leads";
    case "facebook":  return "/contacts?tab=facebook_leads";
    case "instagram": return "/contacts?tab=instagram_leads";
    case "today":     return "/contacts?tab=meta_leads&created=today";
    case "month":     return "/contacts?tab=meta_leads&created=this_month";
    default:          return "/contacts?tab=meta_leads";
  }
}

interface Box {
  key: string;
  label: string;
  value: number;
  gradient: string;       // Tailwind gradient classes
  textColor: string;      // number color
  labelColor: string;     // label color
  iconBg: string;
  iconColor: string;
  dot: string;            // solid color for the dot accent
  icon?: React.ReactNode;
}

export function LeadStatCards({
  stats,
  loading,
}: {
  stats: LeadStats | null;
  loading?: boolean;
}) {
  const boxes: Box[] = [
    {
      key: "total",
      label: "Total Leads",
      value: stats?.total_leads ?? 0,
      gradient: "from-[#3462EE] to-[#5b7ff5]",
      textColor: "text-white",
      labelColor: "text-blue-100",
      iconBg: "bg-white/20",
      iconColor: "text-white",
      dot: "#fff",
      icon: <UsersRound className="size-3.5" />,
    },
    {
      key: "new",
      label: "New Leads",
      value: stats?.new_leads ?? 0,
      gradient: "from-[#10b981] to-[#34d399]",
      textColor: "text-white",
      labelColor: "text-emerald-100",
      iconBg: "bg-white/20",
      iconColor: "text-white",
      dot: "#fff",
      icon: <Sparkles className="size-3.5" />,
    },
    {
      key: "facebook",
      label: "Facebook",
      value: stats?.facebook_leads ?? 0,
      gradient: "from-[#1877F2] to-[#4a9af5]",
      textColor: "text-white",
      labelColor: "text-blue-100",
      iconBg: "bg-white/20",
      iconColor: "text-white",
      dot: "#fff",
      icon: <span className="text-[11px] font-black">f</span>,
    },
    {
      key: "instagram",
      label: "Instagram",
      value: stats?.instagram_leads ?? 0,
      gradient: "from-[#E1306C] to-[#f77737]",
      textColor: "text-white",
      labelColor: "text-pink-100",
      iconBg: "bg-white/20",
      iconColor: "text-white",
      dot: "#fff",
      icon: <span className="text-[11px] font-black">IG</span>,
    },
    {
      key: "today",
      label: "Today",
      value: stats?.today_leads ?? 0,
      gradient: "from-[#f59e0b] to-[#fbbf24]",
      textColor: "text-white",
      labelColor: "text-amber-100",
      iconBg: "bg-white/20",
      iconColor: "text-white",
      dot: "#fff",
      icon: <span className="text-[11px] font-black">↑</span>,
    },
    {
      key: "month",
      label: "This Month",
      value: stats?.month_leads ?? 0,
      gradient: "from-[#7c3aed] to-[#a78bfa]",
      textColor: "text-white",
      labelColor: "text-violet-100",
      iconBg: "bg-white/20",
      iconColor: "text-white",
      dot: "#fff",
      icon: <span className="text-[11px] font-black">M</span>,
    },
  ];

  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {boxes.map((b) => (
        <Link
          key={b.key}
          href={hrefFor(b.key)}
          className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${b.gradient} p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20`}
        >
          {/* Decorative circle */}
          <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/10" />
          <div className="absolute -bottom-3 -right-3 h-10 w-10 rounded-full bg-white/10" />

          <div className="relative">
            <div className="flex items-start justify-between">
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${b.labelColor}`}>
                {b.label}
              </span>
              <ArrowUpRight className={`size-3.5 ${b.iconColor} opacity-0 transition-opacity group-hover:opacity-100`} />
            </div>
            <p className={`mt-2 text-3xl font-bold tabular-nums ${b.textColor}`}>
              {b.value.toLocaleString()}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md ${b.iconBg} ${b.iconColor}`}>
                {b.icon}
              </span>
              <span className={`text-[10px] ${b.labelColor}`}>View leads</span>
            </div>
          </div>
        </Link>
      ))}
      {loading && stats && (
        <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Refreshing…
        </div>
      )}
    </div>
  );
}
