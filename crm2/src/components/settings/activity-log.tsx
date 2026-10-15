'use client';

// ============================================================
// ActivityLog — Settings → Activity
//
// Customer-facing equivalent of the platform audit trail: a
// paginated feed of important account events (contacts created,
// broadcasts launched, member/role changes, WhatsApp connection
// changes) sourced from the shared `audit_log` table. Admin+ only
// — the API route and the RLS policy (migration 050) enforce it
// independently of this UI gate.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MailPlus,
  PlugZap,
  Radio,
  Shield,
  Unplug,
  UserCog,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RequireRole } from '@/components/auth/require-role';
import { SettingsPanelHead } from './settings-panel-head';
import type { AuditLogEntry } from '@/types';

type ActivityEntry = AuditLogEntry & {
  actor_name: string;
  actor_avatar: string | null;
};

interface ActivityResponse {
  entries: ActivityEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Per-action icon + tint. Unknown actions fall back to a neutral dot. */
const ACTION_META: Record<
  string,
  { icon: typeof UserPlus; className: string }
> = {
  'contact.created': {
    icon: UserPlus,
    className: 'bg-emerald-500/10 text-emerald-500',
  },
  'broadcast.created': {
    icon: Radio,
    className: 'bg-primary/10 text-primary',
  },
  'invitation.created': {
    icon: MailPlus,
    className: 'bg-blue-500/10 text-blue-500',
  },
  'member.joined': {
    icon: UsersRound,
    className: 'bg-primary/10 text-primary',
  },
  'member.role_changed': {
    icon: UserCog,
    className: 'bg-amber-500/10 text-amber-500',
  },
  'whatsapp.connected': {
    icon: PlugZap,
    className: 'bg-emerald-500/10 text-emerald-500',
  },
  'whatsapp.disconnected': {
    icon: Unplug,
    className: 'bg-red-500/10 text-red-500',
  },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ActivityFeed() {
  const t = useTranslations('Settings.activity');
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/account/activity?page=${p}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          toast.error(payload.error || t('loadError'));
          return;
        }
        setData((await res.json()) as ActivityResponse);
      } catch {
        toast.error(t('networkError'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  function describe(entry: ActivityEntry): string {
    const details = entry.details ?? {};
    switch (entry.action) {
      case 'contact.created':
        return details.name ? t('contactCreatedNamed', { name: String(details.name) }) : t('contactCreated');
      case 'broadcast.created':
        return details.name
          ? t('broadcastCreatedNamed', { name: String(details.name) })
          : t('broadcastCreated');
      case 'invitation.created':
        return details.label
          ? t('invitationCreatedLabeled', { label: String(details.label), role: String(details.role ?? '') })
          : t('invitationCreated', { role: String(details.role ?? '') });
      case 'member.joined':
        return t('memberJoined', { role: String(details.role ?? '') });
      case 'member.role_changed':
        return t('roleChanged', {
          from: String(details.from ?? ''),
          to: String(details.to ?? ''),
        });
      case 'whatsapp.connected':
        return details.display_phone_number || details.business_name
          ? t('whatsappConnectedTo', {
              target: String(
                details.business_name || details.display_phone_number,
              ),
            })
          : t('whatsappConnected');
      case 'whatsapp.disconnected':
        return t('whatsappDisconnected');
      default:
        return entry.action;
    }
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : !data || data.entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Activity className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                {t('emptyTitle')}
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {t('emptyDesc')}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.entries.map((entry) => {
                const meta = ACTION_META[entry.action];
                const Icon = meta?.icon ?? Shield;
                const actor =
                  entry.actor_name ||
                  (entry.actor_user_id ? t('unknownActor') : t('system'));
                return (
                  <li
                    key={entry.id}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <div
                      className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${meta?.className ?? 'bg-muted text-muted-foreground'}`}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-foreground">
                        <span className="font-medium">{actor}</span>{' '}
                        {describe(entry)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {fmtTime(entry.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {t('pageIndicator', {
                  page: data.page,
                  totalPages: data.totalPages,
                })}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-xs"
                  disabled={loading || data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-xs"
                  disabled={loading || data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function ActivityLog() {
  return (
    <RequireRole min="admin" fallback={<AdminOnlyNotice />}>
      <ActivityFeed />
    </RequireRole>
  );
}

function AdminOnlyNotice() {
  const t = useTranslations('Settings.activity');
  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Shield className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">{t('adminOnlyTitle')}</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {t('adminOnlyDesc')}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
