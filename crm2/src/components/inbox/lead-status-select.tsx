'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import {
  LEAD_STATUS_OPTIONS,
  leadStatusBadgeClassName,
  leadStatusLabel,
  parseLeadStatus,
  setContactLeadStatus,
  type LeadStatus,
} from '@/lib/crm/lead-status';

export interface LeadStatusSelectProps {
  contactId: string;
  /** Current status from the contact row (`null` renders the placeholder). */
  value?: string | null;
  /**
   * Fired only after the write succeeds. Parents must apply it to their
   * `value` immediately, and remount the control with `key={contactId}`
   * when switching contacts so no in-flight state leaks across rows.
   */
  onChange?: (status: LeadStatus) => void;
  /** Optional eyebrow rendered above the control. */
  label?: string;
  /** Shown when the contact has no status yet. */
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  size?: 'sm' | 'default';
  disabled?: boolean;
}

/**
 * The shared CRM STATUS control (spec §23–§27). Writes through
 * `setContactLeadStatus`, so Inbox, Contacts and Pipeline can never
 * disagree on the vocabulary or the write path.
 *
 * `draft` is the value being written: it renders immediately, sticks if
 * the server accepts it, and snaps back to `value` if the write fails.
 */
export function LeadStatusSelect({
  contactId,
  value,
  onChange,
  label,
  placeholder = 'Set status',
  className,
  triggerClassName,
  size = 'sm',
  disabled = false,
}: LeadStatusSelectProps) {
  const [draft, setDraft] = useState<LeadStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const current = draft ?? parseLeadStatus(value);
  const editable = Boolean(contactId) && !disabled;

  async function commit(next: LeadStatus | null) {
    if (!next || !editable || busy || next === current) return;
    setDraft(next);
    setBusy(true);

    const result = await setContactLeadStatus(createClient(), contactId, next);

    setDraft(null);
    if (result.ok) {
      onChange?.(result.status);
      toast.success(`Lead status → ${leadStatusLabel(result.status)}`);
    } else {
      toast.error(result.error);
    }
    setBusy(false);
  }

  return (
    <div className={className}>
      {label ? (
        <span className="text-muted-foreground mb-1 block text-xs">
          {label}
        </span>
      ) : null}
      <Select
        value={current}
        onValueChange={(next) => void commit(parseLeadStatus(next))}
        disabled={!editable || busy}
      >
        <SelectTrigger
          size={size}
          disabled={busy}
          className={triggerClassName}
          aria-busy={busy}
        >
          <SelectValue>
            {(selected: string | null) =>
              selected ? (
                <span className={leadStatusBadgeClassName(selected)}>
                  {leadStatusLabel(selected)}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {placeholder}
                </span>
              )
            }
          </SelectValue>
          {busy ? (
            <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
          ) : null}
        </SelectTrigger>
        <SelectContent>
          {LEAD_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
