"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Code,
  FileSpreadsheet,
  Loader2,
  Mail,
  MessageCircle,
  Plug,
  RefreshCw,
  Settings2,
  ThumbsUp,
  Webhook,
  Power,
  HelpCircle,
  Camera,
  MessageSquare,
  Send,
} from "lucide-react";

interface OverviewPayload {
  whatsapp: {
    connected: boolean;
    accountCount: number;
    primary: {
      id: string;
      displayPhoneNumber: string | null;
      businessName: string | null;
      connectionMethod: string | null;
    } | null;
    lastInboundAt: string | null;
  };
  email: {
    connected: boolean;
    fromEmail: string | null;
    provider: string | null;
  };
  meta: {
    configured: boolean;
    connected: boolean;
    connectionCount: number;
    facebookPages: number;
    instagramAccounts: number;
    lastLeadAt: string | null;
  };
  googleForms: {
    connected: boolean;
    contactCount: number;
    lastSubmissionAt: string | null;
  };
  webhooks: {
    endpointCount: number;
  };
  apiKeys: {
    activeCount: number;
  };
  leadCounts: {
    facebook: number;
    instagram: number;
    whatsapp: number;
    google_form: number;
  };
  telegram: {
    connected: boolean;
    botName: string | null;
    botUsername: string | null;
    lastInboundAt: string | null;
  };
  threads: {
    connected: boolean;
    username: string | null;
    name: string | null;
    connectedAt: string | null;
  } | null;
  x: {
    connected: boolean;
    username: string | null;
    name: string | null;
    connectedAt: string | null;
    accessLevel: string | null;
  } | null;
}

interface HealthPayload {
  checkedAt: string;
  config: {
    metaConfigured: boolean;
    whatsappConfigured: boolean;
  };
  whatsapp: {
    connected: boolean;
    numbers: {
      id: string;
      phoneNumberId: string;
      displayPhoneNumber: string | null;
      businessName: string | null;
      connectionMethod: string | null;
      api: "ok" | "error" | "unverified" | "unknown";
      apiError: string | null;
      webhook: "ok" | "error" | "unverified" | "unknown";
      lastWebhookAt: string | null;
      lastInboundAt: string | null;
    }[];
  };
  facebook: {
    connected: boolean;
    pages: {
      id: string;
      pageId: string;
      pageName: string | null;
      api: "ok" | "error" | "unverified" | "unknown";
      apiError: string | null;
      leadgenWebhook: "ok" | "error" | "unverified" | "unknown";
      messagesWebhook: "ok" | "error" | "unverified" | "unknown";
    }[];
  };
  instagram: {
    connected: boolean;
    accounts: {
      id: string;
      instagramAccountId: string | null;
      username: string | null;
      pageName: string | null;
      api: "ok" | "error" | "unverified" | "unknown";
      apiError: string | null;
    }[];
  };
}

type HealthTone = "ok" | "warn" | "error" | "idle";

type Category =
  | "all"
  | "communication"
  | "social-media"
  | "forms"
  | "marketing"
  | "ecommerce"
  | "crm"
  | "payments"
  | "analytics"
  | "developer"
  | "automation"
  | "ai"
  | "leads"
  | "other";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "communication", label: "Communication" },
  { id: "social-media", label: "Social Media" },
  { id: "forms", label: "Forms" },
  { id: "developer", label: "Developer" },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

interface ConnectionBadgeProps {
  state: "connected" | "notConnected" | "attention" | "available";
  label: string;
}

function ConnectionBadge({ state, label }: ConnectionBadgeProps) {
  const styles: Record<ConnectionBadgeProps["state"], string> = {
    connected: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    notConnected: "border-border bg-muted text-muted-foreground",
    attention: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    available: "border-primary/30 bg-primary/10 text-primary",
  };
  const Icon =
    state === "connected"
      ? CheckCircle2
      : state === "attention"
        ? AlertTriangle
        : Power;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles[state]}`}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function HealthChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: HealthTone;
}) {
  const styles: Record<HealthTone, string> = {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    error: "border-red-500/30 bg-red-500/10 text-red-400",
    idle: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      title={tone === "error" ? `${label}: ${value}` : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      <span className="text-muted-foreground">{label}</span>
      {value}
    </span>
  );
}

interface IntegrationCard {
  id: string;
  category: Exclude<Category, "all">;
  name: string;
  tagline: string;
  icon: typeof Webhook | ((props: { className?: string }) => React.ReactElement);
  iconClass: string;
  description: string;
  notice?: string;
  sections: (payload: OverviewPayload) => { label: string; value: string }[];
  state: (payload: OverviewPayload) => ConnectionBadgeProps;
  health?: (payload: HealthPayload) => { label: string; value: string; tone: HealthTone }[];
  action:
    | { href?: string; actionId?: string; label: string; primary?: boolean }[]
    | ((payload: OverviewPayload) => { href?: string; actionId?: string; label: string; primary?: boolean }[]);
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 192 192" fill="currentColor" className={className}>
      <path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.35-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 10.015 15.86 12.853 26.162l16.147-4.308c-3.44-12.68-8.853-23.606-16.219-32.668C147.036 9.607 125.202.195 97.07 0h-.113C68.882.195 47.292 9.642 32.788 28.08 19.882 44.485 13.224 67.315 13.001 95.932L13 96v.067c.224 28.617 6.882 51.447 19.788 67.854C47.292 182.358 68.882 191.805 96.957 192h.113c24.96-.173 42.554-6.708 57.048-21.189 18.963-18.945 18.392-42.692 12.142-57.27-4.484-10.454-13.033-18.945-24.723-24.553z" />
    </svg>
  );
}

function buildCards(): IntegrationCard[] {
  return [
    {
      id: "whatsapp",
      category: "communication",
      name: "WhatsApp",
      tagline: "Cloud API messaging",
      icon: MessageCircle,
      iconClass: "bg-emerald-500/10 text-emerald-500",
      description:
        "Send and receive WhatsApp messages on one or more numbers through the official WhatsApp Cloud API.",
      sections: (p) => [
        { label: "Connected numbers", value: p.whatsapp.accountCount.toString() },
        {
          label: "Default number",
          value:
            p.whatsapp.primary?.displayPhoneNumber ??
            p.whatsapp.primary?.businessName ??
            "—",
        },
        { label: "Last inbound", value: fmtDate(p.whatsapp.lastInboundAt) },
      ],
      state: (p) =>
        p.whatsapp.connected
          ? { state: "connected", label: "Connected" }
          : { state: "notConnected", label: "Not connected" },
      health: (h) => {
        const nums = h.whatsapp.numbers;
        if (nums.length === 0) return [];
        const apiOk = nums.every((n) => n.api === "ok");
        const apiError = nums.some((n) => n.api === "error");
        const webhookOk = nums.some((n) => n.webhook === "ok");
        const webhookError = nums.some((n) => n.webhook === "error");
        return [
          {
            label: "Cloud API",
            value: apiOk ? "Reachable" : apiError ? "Unreachable" : "Not verified",
            tone: apiError ? "error" : apiOk ? "ok" : "warn",
          },
          {
            label: "Webhook",
            value: webhookOk ? "Subscribed" : webhookError ? "Error" : "Not verified",
            tone: webhookError ? "error" : webhookOk ? "ok" : "warn",
          },
        ];
      },
      action: [{ href: "/settings?tab=whatsapp", label: "Manage", primary: true }],
    },
    {
      id: "instagram-dm",
      category: "communication",
      name: "Instagram DMs",
      tagline: "Instagram Messaging API",
      icon: Camera,
      iconClass: "bg-[#E1306C]/10 text-[#E1306C]",
      description:
        "Receive and reply to Instagram Direct Messages in the shared inbox. Requires a Facebook Page with a linked Instagram Professional account connected via Meta OAuth.",
      sections: (p) => [
        { label: "Instagram accounts", value: p.meta.instagramAccounts.toString() },
        { label: "DMs in inbox", value: p.meta.connected ? "Active" : "—" },
      ],
      state: (p) =>
        !p.meta.configured
          ? { state: "attention", label: "Setup required" }
          : p.meta.instagramAccounts > 0
            ? { state: "connected", label: "Connected" }
            : { state: "notConnected", label: "Not connected" },
      health: (h) => {
        if (h.instagram.accounts.length === 0) return [];
        const apiOk = h.instagram.accounts.every((a) => a.api === "ok");
        const apiError = h.instagram.accounts.some((a) => a.api === "error");
        const msgOk = h.facebook.pages.some((pg) => pg.messagesWebhook === "ok");
        const msgError = h.facebook.pages.some((pg) => pg.messagesWebhook === "error");
        return [
          {
            label: "IG API",
            value: apiOk ? "Reachable" : apiError ? "Unreachable" : "Not verified",
            tone: apiError ? "error" : apiOk ? "ok" : "warn",
          },
          {
            label: "Webhook",
            value: msgOk ? "Subscribed" : msgError ? "Error" : "Not verified",
            tone: msgError ? "error" : msgOk ? "ok" : "warn",
          },
        ];
      },
      action: (p) => [
        {
          href:
            p.meta.instagramAccounts > 0
              ? "/inbox?channel=instagram"
              : "/social-media/connect?platform=instagram",
          label: p.meta.instagramAccounts > 0 ? "Open Inbox" : "Connect Instagram",
          primary: true,
        },
        ...(p.meta.instagramAccounts > 0
          ? [{ href: "/settings?tab=meta-leads", label: "Settings" }]
          : []),
      ],
    },
    {
      id: "facebook-messenger",
      category: "communication",
      name: "Facebook Messenger",
      tagline: "Messenger Platform API",
      icon: MessageSquare,
      iconClass: "bg-[#1877F2]/10 text-[#1877F2]",
      description:
        "Receive and reply to Facebook Messenger messages in the shared inbox. Requires a Facebook Page connected via Meta OAuth with the pages_messaging permission.",
      sections: (p) => [
        { label: "Pages connected", value: p.meta.facebookPages.toString() },
        { label: "Messenger in inbox", value: p.meta.connected ? "Active" : "—" },
      ],
      state: (p) =>
        !p.meta.configured
          ? { state: "attention", label: "Setup required" }
          : p.meta.facebookPages > 0
            ? { state: "connected", label: "Connected" }
            : { state: "notConnected", label: "Not connected" },
      health: (h) => {
        if (h.facebook.pages.length === 0) return [];
        const apiOk = h.facebook.pages.every((pg) => pg.api === "ok");
        const apiError = h.facebook.pages.some((pg) => pg.api === "error");
        const msgOk = h.facebook.pages.some((pg) => pg.messagesWebhook === "ok");
        const msgError = h.facebook.pages.some((pg) => pg.messagesWebhook === "error");
        return [
          {
            label: "Pages API",
            value: apiOk ? "Reachable" : apiError ? "Unreachable" : "Not verified",
            tone: apiError ? "error" : apiOk ? "ok" : "warn",
          },
          {
            label: "Webhook",
            value: msgOk ? "Subscribed" : msgError ? "Error" : "Not verified",
            tone: msgError ? "error" : msgOk ? "ok" : "warn",
          },
        ];
      },
      action: (p) => [
        {
          href:
            p.meta.facebookPages > 0
              ? "/inbox?channel=facebook"
              : "/social-media/connect?platform=facebook",
          label: p.meta.facebookPages > 0 ? "Open Inbox" : "Connect Facebook",
          primary: true,
        },
        ...(p.meta.facebookPages > 0
          ? [{ href: "/settings?tab=meta-leads", label: "Settings" }]
          : []),
      ],
    },
    {
      id: "telegram",
      category: "communication",
      name: "Telegram",
      tagline: "Telegram Bot API",
      icon: Send,
      iconClass: "bg-[#2AABEE]/10 text-[#2AABEE]",
      description:
        "Receive and reply to Telegram DMs in the shared inbox via the official Telegram Bot API. Connect a bot created with @BotFather.",
      sections: (p) => [
        {
          label: "Bot",
          value: p.telegram.connected
            ? (p.telegram.botUsername ? `@${p.telegram.botUsername}` : p.telegram.botName ?? "Connected")
            : "Not connected",
        },
        { label: "Last message", value: fmtDate(p.telegram.lastInboundAt) },
      ],
      state: (p) =>
        p.telegram.connected
          ? { state: "connected", label: "Connected" }
          : { state: "notConnected", label: "Not connected" },
      action: (p) => [
        {
          href: p.telegram.connected ? "/inbox?channel=telegram" : "/settings?tab=telegram",
          label: p.telegram.connected ? "Open Inbox" : "Connect Bot",
          primary: true,
        },
        ...(p.telegram.connected ? [{ href: "/settings?tab=telegram", label: "Settings" }] : []),
      ],
    },
    {
      id: "meta-leads",
      category: "social-media",
      name: "Facebook & Instagram Lead Ads",
      tagline: "Meta Lead Ads",
      icon: ThumbsUp,
      iconClass: "bg-[#1877F2]/10 text-[#1877F2]",
      description:
        "Connect Facebook Pages to automatically capture Lead Ads into the CRM as contacts, with campaign attribution and deduplicated ingestion via the official Meta Graph API.",
      sections: (p) => [
        { label: "Pages connected", value: p.meta.facebookPages.toString() },
        { label: "Instagram accounts", value: p.meta.instagramAccounts.toString() },
        { label: "Leads captured", value: (p.leadCounts.facebook + p.leadCounts.instagram).toString() },
        { label: "Last lead", value: fmtDate(p.meta.lastLeadAt) },
      ],
      state: (p) =>
        !p.meta.configured
          ? { state: "attention", label: "Server setup required" }
          : p.meta.connected
            ? { state: "connected", label: "Connected" }
            : { state: "notConnected", label: "Not connected" },
      health: (h) => {
        if (h.facebook.pages.length === 0) return [];
        const apiOk = h.facebook.pages.every((pg) => pg.api === "ok");
        const apiError = h.facebook.pages.some((pg) => pg.api === "error");
        const leadgenOk = h.facebook.pages.some((pg) => pg.leadgenWebhook === "ok");
        const leadgenError = h.facebook.pages.some((pg) => pg.leadgenWebhook === "error");
        const msgOk = h.facebook.pages.some((pg) => pg.messagesWebhook === "ok");
        const msgError = h.facebook.pages.some((pg) => pg.messagesWebhook === "error");
        return [
          {
            label: "Pages API",
            value: apiOk ? "Reachable" : apiError ? "Unreachable" : "Not verified",
            tone: apiError ? "error" : apiOk ? "ok" : "warn",
          },
          {
            label: "Lead webhook",
            value: leadgenOk ? "Subscribed" : leadgenError ? "Error" : "Not verified",
            tone: leadgenError ? "error" : leadgenOk ? "ok" : "warn",
          },
          {
            label: "Messenger/IG webhook",
            value: msgOk ? "Subscribed" : msgError ? "Error" : "Not verified",
            tone: msgError ? "error" : msgOk ? "ok" : "warn",
          },
        ];
      },
      action: [
        { href: "/social-media", label: "Open lead center", primary: true },
        { href: "/settings?tab=meta-leads", label: "Settings" },
      ],
    },
    {
      id: "email",
      category: "communication",
      name: "Email (SMTP)",
      tagline: "Transactional email",
      icon: Mail,
      iconClass: "bg-blue-500/10 text-blue-500",
      description:
        "Configure an SMTP provider for sending email from your account. Credentials are stored encrypted and scoped to this account.",
      sections: (p) => [
        { label: "From address", value: p.email.fromEmail ?? "—" },
        { label: "Provider", value: p.email.provider ?? "—" },
      ],
      state: (p) =>
        p.email.connected
          ? { state: "connected", label: "Connected" }
          : { state: "notConnected", label: "Not connected" },
      action: (p) => [{ href: "/settings?tab=email", label: "Configure", primary: p.email.connected }],
    },
    {
      id: "google-forms",
      category: "forms",
      name: "Google Forms",
      tagline: "Form → CRM contact",
      icon: FileSpreadsheet,
      iconClass: "bg-amber-500/10 text-amber-500",
      description:
        "Every Google Form submission is delivered into the CRM as an ordinary contact via a public API key with the contacts:write scope.",
      sections: (p) => [
        { label: "Contacts synced", value: p.googleForms.contactCount.toString() },
        { label: "Last submission", value: fmtDate(p.googleForms.lastSubmissionAt) },
      ],
      state: (p) =>
        p.googleForms.connected
          ? { state: "connected", label: "Active" }
          : { state: "notConnected", label: "Not started" },
      action: (p) => [
        {
          href: "/settings?tab=google-forms",
          label: p.googleForms.connected ? "Manage" : "Set up",
          primary: true,
        },
        { href: "/contacts?source=google_form", label: "View contacts" },
      ],
    },
    {
      id: "webhooks",
      category: "developer",
      name: "Outbound Webhooks",
      tagline: "Event delivery",
      icon: Webhook,
      iconClass: "bg-violet-500/10 text-violet-500",
      description:
        "Receive CRM events at your own endpoints. Register endpoints with a webhooks:manage API key; delivery is signed and SSRF-protected.",
      sections: (p) => [{ label: "Endpoints", value: p.webhooks.endpointCount.toString() }],
      state: (p) =>
        p.webhooks.endpointCount > 0
          ? { state: "connected", label: "Active" }
          : { state: "notConnected", label: "Not configured" },
      action: [{ href: "/api", label: "Open API docs", primary: true }],
    },
    {
      id: "api-keys",
      category: "developer",
      name: "Public API & API Keys",
      tagline: "Programmatic access",
      icon: Code,
      iconClass: "bg-slate-500/10 text-slate-300",
      description:
        "Create scoped API keys to integrate other tools. Every key is account-scoped, revocable, and never shown in plaintext after creation.",
      sections: (p) => [
        { label: "Active keys", value: p.apiKeys.activeCount.toString() },
        { label: "Google Form endpoint", value: "/api/v1/integrations/google-forms" },
      ],
      state: () => ({ state: "available", label: "Available" }),
      action: [{ href: "/settings?tab=api", label: "Manage keys", primary: true }],
    },
    {
      id: "threads",
      category: "social-media",
      name: "Threads",
      tagline: "Meta Threads API",
      icon: ThreadsIcon,
      iconClass: "bg-foreground/5 text-foreground",
      description:
        "Connect your Threads account to publish posts and manage replies via the official Meta Threads API. DMs are not supported by the Threads API.",
      notice: "Threads does not support DMs — inbox integration is not available.",
      sections: (p) => [
        { label: "Account", value: p.threads?.connected ? (p.threads.username ? `@${p.threads.username}` : p.threads.name ?? "Connected") : "Not connected" },
        { label: "Connected", value: p.threads?.connectedAt ? fmtDate(p.threads.connectedAt) : "—" },
        { label: "Capabilities", value: "Publish posts, manage replies" },
      ],
      state: (p) =>
        p.threads?.connected
          ? { state: "connected", label: "Connected" }
          : { state: "notConnected", label: "Not connected" },
      action: (p) =>
        p.threads?.connected
          ? [
              { actionId: "threads-refresh", label: "Refresh token" },
              { actionId: "threads-disconnect", label: "Disconnect" },
            ]
          : [{ actionId: "threads-connect", label: "Connect Threads", primary: true }],
    },
    {
      id: "x",
      category: "social-media",
      name: "X (Twitter)",
      tagline: "X API v2 · OAuth 2.0 PKCE",
      icon: XIcon,
      iconClass: "bg-foreground/5 text-foreground",
      description:
        "Connect your X account to publish tweets and read your timeline via the official X API v2. DMs and real-time webhooks require Pro ($5,000/mo) or Enterprise tier.",
      notice: "DMs and webhooks require X Pro/Enterprise. Free tier: publish tweets, read timeline.",
      sections: (p) => [
        { label: "Account", value: p.x?.connected ? (p.x.username ? `@${p.x.username}` : p.x.name ?? "Connected") : "Not connected" },
        { label: "Access level", value: p.x?.accessLevel ?? "—" },
        { label: "Connected", value: p.x?.connectedAt ? fmtDate(p.x.connectedAt) : "—" },
      ],
      state: (p) =>
        p.x?.connected
          ? { state: "connected", label: "Connected" }
          : { state: "notConnected", label: "Not connected" },
      action: (p) =>
        p.x?.connected
          ? [
              { actionId: "x-refresh", label: "Refresh token" },
              { actionId: "x-disconnect", label: "Disconnect" },
            ]
          : [{ actionId: "x-connect", label: "Connect X", primary: true }],
    },
  ];
}

export default function IntegrationsPage() {
  const [payload, setPayload] = useState<OverviewPayload | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, hRes, tgRes, thRes, xRes] = await Promise.all([
        fetch("/api/integrations/overview", { cache: "no-store" }),
        fetch("/api/integrations/health", { cache: "no-store" }),
        fetch("/api/telegram/connect", { cache: "no-store" }),
        fetch("/api/threads/connect", { cache: "no-store" }),
        fetch("/api/x/connect", { cache: "no-store" }),
      ]);
      if (!ovRes.ok || !hRes.ok) {
        setError("Could not load integration status. Please try again.");
        return;
      }
      const ovData = await ovRes.json();
      if (tgRes.ok) {
        const tgData = await tgRes.json();
        const bot = tgData.bot;
        ovData.telegram = {
          connected: bot?.status === "connected",
          botName: bot?.bot_name ?? null,
          botUsername: bot?.bot_username ?? null,
          lastInboundAt: bot?.last_inbound_at ?? null,
        };
      } else {
        ovData.telegram = { connected: false, botName: null, botUsername: null, lastInboundAt: null };
      }
      if (thRes.ok) {
        const thData = await thRes.json();
        ovData.threads = thData.connected ? thData.integration : { connected: false, username: null, name: null, connectedAt: null };
      } else {
        ovData.threads = null;
      }
      if (xRes.ok) {
        const xData = await xRes.json();
        ovData.x = xData.connected ? xData.integration : { connected: false, username: null, name: null, connectedAt: null, accessLevel: null };
      } else {
        ovData.x = null;
      }
      setPayload(ovData);
      setHealth((await hRes.json()) as HealthPayload);
    } catch (err) {
      console.error("Integrations overview load failed:", err);
      setError("Could not load integration status. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch("/api/integrations/health", { cache: "no-store" });
      if (!res.ok) throw new Error("health failed");
      setHealth((await res.json()) as HealthPayload);
    } catch (err) {
      console.error("Health check failed:", err);
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  const handleAction = useCallback(async (actionId: string) => {
    setActionLoading(actionId);
    try {
      if (actionId === "threads-connect") {
        const res = await fetch("/api/threads/connect", { method: "POST" });
        const data = await res.json();
        if (data.authUrl) window.location.href = data.authUrl;
      } else if (actionId === "threads-disconnect") {
        await fetch("/api/threads/connect", { method: "DELETE" });
        void load();
      } else if (actionId === "threads-refresh") {
        await fetch("/api/threads/connect", { method: "PATCH" });
        void load();
      } else if (actionId === "x-connect") {
        const res = await fetch("/api/x/connect", { method: "POST" });
        const data = await res.json();
        if (data.authUrl) window.location.href = data.authUrl;
      } else if (actionId === "x-disconnect") {
        await fetch("/api/x/connect", { method: "DELETE" });
        void load();
      } else if (actionId === "x-refresh") {
        await fetch("/api/x/connect", { method: "PATCH" });
        void load();
      }
    } catch (err) {
      console.error("Action failed:", actionId, err);
    } finally {
      setActionLoading(null);
    }
  }, [load]);

  // Detect OAuth return params and reload status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("threads_oauth") || params.has("x_oauth")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("threads_oauth");
      url.searchParams.delete("x_oauth");
      window.history.replaceState({}, "", url.toString());
      void load();
    }
  }, [load]);

  const cards = payload ? buildCards() : [];
  const visible =
    category === "all" ? cards : cards.filter((c) => c.category === category);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Plug className="h-6 w-6 text-primary" />
            Integrations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect the tools your business already uses. Every card reflects an
            actual, verified integration in your account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void checkHealth()}
          disabled={loading || checkingHealth}
          title="Re-check every connection against the Meta Graph API"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={checkingHealth ? "size-3.5 animate-spin" : "size-3.5"} />
          {checkingHealth ? "Checking…" : "Check status"}
        </button>
      </div>

      {health && !loading && (
        <p className="-mt-3 text-[11px] text-muted-foreground">
          Health verified {new Date(health.checkedAt).toLocaleTimeString()} · checks
          hit the live Meta Graph API; credentials are never exposed.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              category === cat.id
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading integration status…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-16 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive/60" />
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Retry
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-16 text-center">
          <HelpCircle className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            No integrations in this category yet
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {visible.map((card) => {
            const badge = card.state(payload!);
            const actions =
              typeof card.action === "function" ? card.action(payload!) : card.action;
            const Icon = card.icon;
            return (
              <li
                key={card.id}
                className="flex flex-col rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconClass}`}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {card.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">{card.tagline}</p>
                    </div>
                  </div>
                  <ConnectionBadge {...badge} />
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  {card.description}
                </p>

                {card.notice && (
                  <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                    {card.notice}
                  </p>
                )}

                <dl className="mt-4 space-y-1.5 rounded-lg bg-muted/40 px-3 py-2.5">
                  {card.sections(payload!).map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <dt className="text-xs text-muted-foreground">{s.label}</dt>
                      <dd className="truncate text-sm font-semibold tabular-nums text-foreground">
                        {s.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {card.health && health && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {card.health(health).map((h) => (
                      <HealthChip key={h.label} label={h.label} value={h.value} tone={h.tone} />
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 pt-1">
                  {actions.map((a) => {
                    if (a.actionId) {
                      const isLoading = actionLoading === a.actionId;
                      return (
                        <button
                          key={a.actionId}
                          type="button"
                          disabled={isLoading || actionLoading !== null}
                          onClick={() => void handleAction(a.actionId!)}
                          className={a.primary
                            ? "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                            : "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"}
                        >
                          {isLoading ? <Loader2 className="size-3 animate-spin" /> : null}
                          {a.label}
                        </button>
                      );
                    }
                    return a.primary ? (
                      <Link
                        key={a.label}
                        href={a.href!}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        {a.label}
                      </Link>
                    ) : (
                      <Link
                        key={a.label}
                        href={a.href!}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        <Settings2 className="size-3.5" /> {a.label}
                      </Link>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
