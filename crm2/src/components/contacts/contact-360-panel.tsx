'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw, Sparkles, MessageSquare, CalendarCheck, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LeadScoreBadge } from './lead-score-badge';
import { leadStatusBadgeClassName, leadStatusLabel } from '@/lib/crm/lead-status';
import type { Contact } from '@/types';

interface LeadScoreResult {
  contact_id: string;
  score: number;
  tier: 'cold' | 'warm' | 'hot';
  reasons: { label: string; points: number }[];
  recommended_action: string;
  signals: {
    inbound_messages: number;
    outbound_messages: number;
    replied_recently: boolean;
    deal_count: number;
    deal_value: number;
    appointment_count: number;
    lead_status: string | null;
  };
}

/**
 * Customer 360 panel — a single view of a contact's health: AI lead
 * score, WhatsApp identity, and the engagement/commercial signals that
 * drive it. Uses only real data (compute_lead_score RPC + contacts row).
 * Reusing this component requires only `contact` + optional `onScoreUpdated`.
 */
export function Contact360Panel({
  contact,
  onScoreUpdated,
}: {
  contact: Contact;
  onScoreUpdated?: (score: LeadScoreResult) => void;
}) {
  const tz = useTranslations('Contacts.leadScore');

  const [score, setScore] = useState<LeadScoreResult | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [latestScoreAt, setLatestScoreAt] = useState<string | null>(
    contact.lead_score_updated_at ?? null,
  );

  const recompute = useCallback(async () => {
    setRecomputing(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/lead-score`, {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Failed to compute score');
      const result = data.lead_score as LeadScoreResult;
      setScore(result);
      setLatestScoreAt(new Date().toISOString());
      onScoreUpdated?.(result);
      toast.success(tz('toastRecomputed'));
    } catch (err) {
      console.error('[360] recompute failed:', err);
      toast.error(tz('toastFailed'));
    } finally {
      setRecomputing(false);
    }
  }, [contact.id, onScoreUpdated, tz]);

  const current = score;
  const displayScore = current?.score ?? contact.lead_score ?? null;
  const displayTier = current?.tier ?? contact.lead_score_tier ?? null;
  const reasons = current?.reasons ??
    (contact.lead_score_reason
      ? contact.lead_score_reason.split('; ').map((label) => ({ label, points: 0 }))
      : []);

  return (
    <div className="space-y-4">
      {/* Lead score card */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{tz('title')}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={recompute}
            disabled={recomputing}
            className="h-7 gap-1 text-xs"
          >
            {recomputing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {tz('recompute')}
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <LeadScoreBadge score={displayScore} tier={displayTier} />
          {latestScoreAt && (
            <span className="text-[11px] text-muted-foreground">
              {tz('updatedAt', {
                time: new Date(latestScoreAt).toLocaleString(),
              })}
            </span>
          )}
        </div>

        {displayScore == null && (
          <p className="mt-3 text-xs text-muted-foreground">{tz('notScored')}</p>
        )}

        {reasons.length > 0 && (
          <ul className="mt-3 space-y-1">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                {r.points !== 0 && (
                  <Badge
                    variant="outline"
                    className={r.points > 0 ? 'text-green-600 border-green-200' : 'text-red-500 border-red-200'}
                  >
                    {r.points > 0 ? `+${r.points}` : r.points}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}

        {current?.recommended_action && (
          <div className="mt-3 rounded-md bg-primary/5 p-2.5">
            <p className="text-xs font-medium text-foreground">
              {tz('recommendedAction')}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {current.recommended_action}
            </p>
          </div>
        )}
      </div>

      {/* WhatsApp identity */}
      {contact.whatsapp_name && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium">{tz('whatsappName')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{contact.whatsapp_name}</p>
        </div>
      )}

      {/* Signals */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-sm font-medium">{tz('signals')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{tz('messagesIn', { count: current?.signals.inbound_messages ?? 0 })}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{tz('messagesOut', { count: current?.signals.outbound_messages ?? 0 })}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
            <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{tz('dealsValue', { count: current?.signals.deal_count ?? 0 })}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
            <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{tz('appointments', { count: current?.signals.appointment_count ?? 0 })}</span>
          </div>
        </div>
        <Separator className="my-3" />
        <p className="text-xs text-muted-foreground">
          {tz('leadStatusLabel')}:{' '}
          <span className={leadStatusBadgeClassName(contact.lead_status)}>
            {leadStatusLabel(contact.lead_status)}
          </span>
        </p>
      </div>
    </div>
  );
}