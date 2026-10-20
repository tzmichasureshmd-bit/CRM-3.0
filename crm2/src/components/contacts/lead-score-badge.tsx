'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Contact } from '@/types';

const TIER_STYLES: Record<string, { label: string; className: string }> = {
  hot: { label: 'Hot lead', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  warm: { label: 'Warm lead', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  cold: { label: 'Cold lead', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

/**
 * Score badge for a contact. Renders "score / tier" with a tier-matched
 * color. Pass `score` and `tier` directly (from a hydrated Contact or a
 * lead-score API response) so it works anywhere without needing the full
 * contact row.
 */
export function LeadScoreBadge({
  score,
  tier,
  className,
}: {
  score: number | null | undefined;
  tier?: string | null;
  className?: string;
}) {
  if (score == null) {
    return (
      <Badge
        variant="outline"
        className={cn('border-border text-muted-foreground', className)}
      >
        No score yet
      </Badge>
    );
  }

  const style = (tier && TIER_STYLES[tier]) || TIER_STYLES.cold;

  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 font-medium', style.className, className)}
    >
      <span className="tabular-nums">{score}</span>
      <span className="opacity-80">·</span>
      {style.label}
    </Badge>
  );
}

export function contactTier(contact: Contact | null | undefined) {
  if (!contact?.lead_score) return null;
  if (contact.lead_score >= 60) return 'hot';
  if (contact.lead_score >= 25) return 'warm';
  return 'cold';
}