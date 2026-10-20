"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  LogOut,
  Settings,
  User,
  UserCog,
  UsersRound,
  Shield,
  X,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";

// ── Custom SVG nav icons ──────────────────────────────────────
function IconDashboard({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
}
function IconInbox({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3H10l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>;
}
function IconContacts({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
}
function IconCampaigns({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></svg>;
}
function IconBroadcast({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/><path d="M2 12C2 6.48 6.48 2 12 2"/><path d="M5 12a7 7 0 017-7"/></svg>;
}
function IconTemplates({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>;
}
function IconPresets({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>;
}
function IconAutomations({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
}
function IconFlows({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7"/><path d="M11 18H8a2 2 0 01-2-2V9"/></svg>;
}
function IconBot({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>;
}
function IconFollowups({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M8 10h8"/><path d="M8 14h5"/></svg>;
}
function IconQuickReplies({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M13 8l-3 4h5l-3 4"/></svg>;
}
function IconKeyboard({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>;
}
function IconAppointments({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>;
}
function IconCRM({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
}
function IconPipelines({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12H2"/><path d="M5 5l-3 7 3 7"/><path d="M19 5l3 7-3 7"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>;
}
function IconReports({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
}
function IconSaveMoney({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/><path d="M12 6v6l4 2"/><path d="M9 12h6"/></svg>;
}
function IconNotifications({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>;
}
function IconMedia({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
}
function IconAPI({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="12" y1="2" x2="12" y2="22"/></svg>;
}
function IconGuide({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>;
}
function IconSocialMedia({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
}
function IconTickets({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 010-6h20a3 3 0 010 6"/><path d="M2 15a3 3 0 000 6h20a3 3 0 000-6"/><path d="M6 9v6"/><path d="M18 9v6"/></svg>;
}
function IconIntegrations({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>;
}
function IconBilling({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
}
function IconSettings({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}
// ──────────────────────────────────────────────────────────────
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
}
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}
function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}
function TwitterXIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}
function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.169 10.169 0 0 0-2.215-.221z"/>
    </svg>
  );
}
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";

const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: { icon: Crown, labelKey: "roleOwner", className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  admin: { icon: Shield, labelKey: "roleAdmin", className: "border-primary/40 bg-primary/10 text-primary" },
  agent: { icon: UserCog, labelKey: "roleAgent", className: "border-border bg-muted text-foreground" },
  viewer: { icon: User, labelKey: "roleViewer", className: "border-border bg-card text-muted-foreground" },
};

interface NavItem { href: string; labelKey: string; icon: React.ComponentType<{ className?: string }>; beta?: boolean }
interface NavSection { labelKey: string; items: NavItem[]; defaultOpen?: boolean }

const navSections: NavSection[] = [
  {
    labelKey: "sectionConversations",
    items: [
      { href: "/inbox", labelKey: "inbox", icon: IconInbox },
      { href: "/contacts", labelKey: "contacts", icon: IconContacts },
    ],
    defaultOpen: true,
  },
  {
    labelKey: "sectionGrowth",
    items: [
      { href: "/pipelines", labelKey: "pipelines", icon: IconPipelines },
      { href: "/crm", labelKey: "crm", icon: IconCRM },
      { href: "/save-money", labelKey: "saveMoney", icon: IconSaveMoney },
    ],
  },
  {
    labelKey: "sectionMarketing",
    items: [
      { href: "/campaigns", labelKey: "campaigns", icon: IconCampaigns },
      { href: "/broadcasts", labelKey: "broadcasts", icon: IconBroadcast },
      { href: "/templates", labelKey: "templates", icon: IconTemplates },
      { href: "/presets", labelKey: "presetCampaigns", icon: IconPresets },
    ],
    defaultOpen: true,
  },
  {
    labelKey: "sectionAutomation",
    items: [
      { href: "/automations", labelKey: "automations", icon: IconAutomations },
      { href: "/automations/flows", labelKey: "automationFlows", icon: IconFlows },
      { href: "/automations/bot-builder", labelKey: "botFlowBuilder", icon: IconBot, beta: true },
      { href: "/automations/followups", labelKey: "aiFollowups", icon: IconFollowups },
      { href: "/automations/quick-replies", labelKey: "quickReplies", icon: IconQuickReplies },
      { href: "/automations/keyboard-triggers", labelKey: "keyboardTriggers", icon: IconKeyboard },
      { href: "/automations/appointments", labelKey: "appointments", icon: IconAppointments },
    ],
    defaultOpen: true,
  },
  {
    labelKey: "sectionSystem",
    items: [
      { href: "/reports", labelKey: "reports", icon: IconReports },
      { href: "/media-library", labelKey: "mediaLibrary", icon: IconMedia },
      { href: "/notifications", labelKey: "notifications", icon: IconNotifications },
      { href: "/api", labelKey: "apiDeveloper", icon: IconAPI },
    ],
  },
];

const bottomNavItems = [
  { href: "/billing", labelKey: "billing", icon: IconBilling },
  { href: "/settings", labelKey: "settings", icon: IconSettings },
  { href: "/guide", labelKey: "userGuide", icon: IconGuide },
];

const SECTION_STORAGE_KEY = "wacrm-sidebar-sections";

function loadSectionState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(SECTION_STORAGE_KEY) ?? "{}"); }
  catch { return {}; }
}

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ open = false, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  const showAccountStrip = !profileLoading && !!account?.name && account.name !== profile?.full_name;

  const [channelStatus, setChannelStatus] = useState<{
    whatsapp: boolean; instagram: boolean; facebook: boolean; telegram: boolean;
    x: boolean; threads: boolean;
  }>({ whatsapp: false, instagram: false, facebook: false, telegram: false, x: false, threads: false });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/integrations/overview", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/telegram/connect", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/x/connect", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/threads/connect", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([overview, tg, xData, thData]) => {
      if (cancelled) return;
      setChannelStatus({
        whatsapp: overview?.whatsapp?.connected === true,
        instagram: (overview?.meta?.instagramAccounts ?? 0) > 0,
        facebook: (overview?.meta?.facebookPages ?? 0) > 0,
        telegram: tg?.bot?.status === "connected",
        x: xData?.connected === true,
        threads: thData?.connected === true,
      });
    });
    return () => { cancelled = true; };
  }, []);

  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>(() => {
    const saved = loadSectionState();
    const initial: Record<string, boolean> = {};
    for (const s of navSections) initial[s.labelKey] = saved[s.labelKey] ?? (s.defaultOpen ?? false);
    return initial;
  });

  useEffect(() => {
    try { localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(sectionsOpen)); } catch {}
  }, [sectionsOpen]);

  const toggleSection = useCallback((key: string) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => { onClose?.(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  const { isOwner, isAdmin } = useAuth();
  const canAccessOrgAdmin = isOwner || isAdmin;

  const allSectionItems = navSections.flatMap((s) => s.items);

  return (
    <>
      {/* Mobile backdrop */}
      <button
        type="button"
        aria-label={t("closeMenu")}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r border-border bg-card",
          "transition-all duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:translate-x-0 lg:transition-none",
          "lg:shadow-[1px_0_0_0_rgba(0,0,0,0.04)]",
          collapsed ? "w-64 lg:w-[60px]" : "w-64 lg:w-60",
        )}
        aria-label="Primary"
      >
        {/* ── Header ── */}
        <div className={cn(
          "flex h-14 shrink-0 items-center border-b border-border",
          collapsed ? "lg:justify-center px-3" : "justify-between gap-2 px-3",
        )}>
          <Link
            href="/dashboard"
            className={cn("flex items-center gap-2.5", collapsed && "lg:justify-center")}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              <Image src="/images/logo.png" alt="Logo" width={40} height={40} className="rounded-lg object-contain" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-foreground">{t("title")}</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("subtitle")}</span>
              </div>
            )}
          </Link>

          {/* Mobile close */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Desktop collapse toggle — Zoho style highlighted */}
          {!collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              className="hidden h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20 transition-all hover:bg-primary hover:text-primary-foreground hover:ring-primary lg:flex"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-1.5" : "px-2")}>

          {/* Collapsed: expand button */}
          {collapsed && (
            <div className="mb-2 flex justify-center">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Expand sidebar"
                className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20 transition-all hover:bg-primary hover:text-primary-foreground hover:ring-primary"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Top items */}
          <ul className="flex flex-col gap-0.5">
            {[
              { href: "/dashboard", labelKey: "dashboard", icon: IconDashboard },
              { href: "/social-media", labelKey: "socialMedia", icon: IconSocialMedia },
              { href: "/tickets", labelKey: "tickets", icon: IconTickets },
              { href: "/integrations", labelKey: "integrations", icon: IconIntegrations },
            ].map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? t(item.labelKey as string) : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                      collapsed && "lg:justify-center lg:px-0",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1">{t(item.labelKey as string)}</span>}
                    {!collapsed && isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-2 border-t border-border/60" />

          {/* COLLAPSED: flat icon list for all section items */}
          {collapsed && (
            <ul className="flex flex-col gap-0.5">
              {allSectionItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={t(item.labelKey as string)}
                      className={cn(
                        "flex items-center justify-center rounded-lg py-2 text-sm font-medium transition-all",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {/* EXPANDED: collapsible sections */}
          {!collapsed && (
            <div className="flex flex-col gap-1">
              {navSections.map((section) => {
                const isOpen = sectionsOpen[section.labelKey] ?? false;
                const hasActiveChild = section.items.some(
                  (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
                );
                return (
                  <div key={section.labelKey}>
                    <button
                      type="button"
                      onClick={() => toggleSection(section.labelKey)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                        hasActiveChild ? "text-primary/80 hover:text-primary" : "text-muted-foreground/60 hover:text-muted-foreground",
                      )}
                      aria-expanded={isOpen}
                    >
                      <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
                      <span className="flex-1 text-left">{t(section.labelKey)}</span>
                      {section.items.some((item) => item.href === "/inbox" && totalUnread > 0) && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                          {totalUnread > 9 ? "9+" : totalUnread}
                        </span>
                      )}
                    </button>
                    <div className={cn("overflow-hidden transition-all duration-200 ease-in-out", isOpen ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0")}>
                      <ul className="flex flex-col gap-0.5 py-1 pl-2">
                        {section.items.map((item) => {
                          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                          const showUnreadDot = item.href === "/inbox" && totalUnread > 0 && !isActive;
                          const showNotifBadge = item.href === "/notifications" && unreadNotifications > 0;
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                className={cn(
                                  "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150",
                                  isActive
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                              >
                                <item.icon className="h-4 w-4 shrink-0" />
                                <span className="flex-1">{t(item.labelKey as string)}</span>
                                {item.beta && (
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                                    {t("beta")}
                                  </span>
                                )}
                                {showUnreadDot && (
                                  <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-foreground" />
                                  </span>
                                )}
                                {showNotifBadge && (
                                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] font-semibold text-primary">
                                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                                  </span>
                                )}
                                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>

                      {/* Channels block — shown inside Conversations section */}
                      {section.labelKey === "sectionConversations" && (
                        <div className="mt-2 border-t border-border/40 pt-2 pl-2">
                          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Channels</p>
                          <ul className="flex flex-col gap-0.5">
                            {[
                              { label: "WhatsApp", icon: WhatsAppIcon, color: "text-[#25D366]", href: "/inbox?channel=whatsapp", connected: channelStatus.whatsapp, available: true },
                              { label: "Instagram", icon: InstagramIcon, color: "text-[#E1306C]", href: channelStatus.instagram ? "/inbox?channel=instagram" : "/settings?tab=meta-leads", connected: channelStatus.instagram, available: true },
                              { label: "Facebook", icon: FacebookIcon, color: "text-[#1877F2]", href: channelStatus.facebook ? "/inbox?channel=facebook" : "/settings?tab=meta-leads", connected: channelStatus.facebook, available: true },
                              { label: "Telegram", icon: TelegramIcon, color: "text-[#26A5E4]", href: channelStatus.telegram ? "/inbox?channel=telegram" : "/settings?tab=telegram", connected: channelStatus.telegram, available: true },
                              { label: "Twitter / X", icon: TwitterXIcon, color: "text-foreground", href: channelStatus.x ? "/inbox?channel=x" : "/integrations", connected: channelStatus.x, available: true },
                              { label: "Threads", icon: ThreadsIcon, color: "text-foreground", href: channelStatus.threads ? "/integrations" : "/integrations", connected: channelStatus.threads, available: true },
                            ].map((ch) => (
                              <li key={ch.label}>
                                <Link
                                  href={ch.href}
                                  className="group flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                                >
                                  <ch.icon className={cn("h-4 w-4 shrink-0", ch.color)} />
                                  <span className="flex-1">{ch.label}</span>
                                  {ch.connected ? (
                                    <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  ) : ch.available ? (
                                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground/60">Connect</span>
                                  ) : (
                                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground/40">Soon</span>
                                  )}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="my-2 border-t border-border/60" />

          {/* Bottom nav */}
          <ul className="flex flex-col gap-0.5">
            {bottomNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? t(item.labelKey as string) : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                      collapsed && "lg:justify-center lg:px-0",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1">{t(item.labelKey as string)}</span>}
                    {!collapsed && isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── User section ── */}
        {!collapsed && (
          <div className="shrink-0 border-t border-border p-3">
            {showAccountStrip && account?.name && (
              <div className="mb-2 flex items-center gap-2 px-3 text-xs text-muted-foreground">
                <UsersRound className="size-3.5 shrink-0" />
                <span className="truncate" title={account.name}>{account.name}</span>
                {accountRole && (() => {
                  const meta = ROLE_CHIP[accountRole];
                  const Icon = meta.icon;
                  return (
                    <span className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.className}`}>
                      <Icon className="size-3" />{t(meta.labelKey as string)}
                    </span>
                  );
                })()}
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none data-popup-open:bg-muted/60">
                <Avatar className="size-8 shrink-0">
                  {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? t("defaultAvatar")} />}
                  <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                    {profile?.full_name?.charAt(0)?.toUpperCase() ?? profile?.email?.charAt(0)?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{profile?.full_name ?? t("defaultUser")}</p>
                  <p className="truncate text-xs text-muted-foreground">{profile?.email ?? ""}</p>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" sideOffset={6} className="min-w-56 bg-popover text-popover-foreground ring-border">
                <DropdownMenuItem render={<Link href="/settings?tab=profile" onClick={onClose} className="text-popover-foreground focus:bg-accent focus:text-accent-foreground" />}>
                  <User className="size-4" />{t("menuProfile")}
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/settings?tab=whatsapp" onClick={onClose} className="text-popover-foreground focus:bg-accent focus:text-accent-foreground" />}>
                  <Settings className="size-4" />{t("menuSettings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem onClick={signOut} className="text-popover-foreground focus:bg-accent focus:text-accent-foreground">
                  <LogOut className="size-4" />{t("menuSignOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Collapsed: avatar only at bottom */}
        {collapsed && (
          <div className="shrink-0 border-t border-border p-2 flex justify-center">
            <Avatar className="size-8 cursor-pointer">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? ""} />}
              <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                {profile?.full_name?.charAt(0)?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
      </aside>
    </>
  );
}
