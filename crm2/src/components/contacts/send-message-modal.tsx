'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Contact, MessageTemplate } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Inbox,
  Loader2,
  MessageSquare,
  Phone,
  Mail,
  Building2,
  MapPin,
  ShieldAlert,
  Send,
} from 'lucide-react';
import { useCan } from '@/hooks/use-can';
import { useAuth } from '@/hooks/use-auth';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';

/**
 * How a variable slot maps to a contact value. We let the business
 * choose a source per placeholder: a built-in contact field, or a
 * static value typed by the user. Unknown/unsupported variables are
 * rejected before sending (we never fabricate Meta variables).
 */
type VariableSource = 'contact' | 'static';

interface VariableConfig {
  source: VariableSource;
  /** contact field name or the typed static value */
  value: string;
  /** resolved value label for preview */
  resolved: string;
}

/** Built-in contact fields the business can personalize with. */
const PERSONALIZABLE_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Contact Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'location', label: 'Location' },
  { key: 'category', label: 'Category' },
];

interface SendMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  /** Called after a successful send so the page can refresh. */
  onSent?: () => void;
}

function formatTemplateName(t: MessageTemplate): string {
  return t.name;
}

export function SendMessageModal({
  open,
  onOpenChange,
  contact,
  onSent,
}: SendMessageModalProps) {
  const canSend = useCan('send-messages');
  const router = useRouter();
  const { accountId, user } = useAuth();

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const [templateId, setTemplateId] = useState<string>('');
  // body vars -> config (index keyed by placeholder position 0..n-1)
  const [vars, setVars] = useState<Record<number, VariableConfig>>({});
  const [headerText, setHeaderText] = useState<string>('');
  // url button index -> value
  const [urlButtonVals, setUrlButtonVals] = useState<Record<number, string>>({});

  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [openingInbox, setOpeningInbox] = useState(false);
  // opt-out editing
  const [optOut, setOptOut] = useState(false);
  const [optOutReason, setOptOutReason] = useState('');
  const [savingOptOut, setSavingOptOut] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  // variable slots for the selected template
  const bodyVars = useMemo(
    () => (selectedTemplate ? extractVariableIndices(selectedTemplate.body_text) : []),
    [selectedTemplate],
  );
  const headerVarCount = useMemo(() => {
    if (!selectedTemplate) return 0;
    return selectedTemplate.header_type === 'text' && selectedTemplate.header_content
      ? extractVariableIndices(selectedTemplate.header_content).length
      : 0;
  }, [selectedTemplate]);
  const urlButtonSlots = useMemo(() => {
    const slots: { index: number; text: string; url: string }[] = [];
    (selectedTemplate?.buttons ?? []).forEach((b, i) => {
      if (b.type === 'URL' && extractVariableIndices(b.url).length > 0) {
        slots.push({ index: i, text: b.text, url: b.url });
      }
    });
    return slots;
  }, [selectedTemplate]);

  function resolveContactField(key: string): string {
    if (!contact) return '';
    switch (key) {
      case 'name':
        return contact.name ?? '';
      case 'phone':
        return contact.phone ?? '';
      case 'email':
        return contact.email ?? '';
      case 'company':
        return contact.company ?? '';
      case 'location':
        return contact.location ?? '';
      case 'category':
        return contact.category ?? '';
      default:
        return '';
    }
  }

  // Reset per-open
  useEffect(() => {
    if (!open) return;
    setTemplateId('');
    setVars({});
    setHeaderText('');
    setUrlButtonVals({});
    setSentOk(false);
    setSending(false);
    setOptOut(contact?.messaging_opt_out ?? false);
    setOptOutReason(contact?.opted_out_reason ?? '');
  }, [open, contact]);

  // Load approved templates
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingTemplates(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('message_templates')
        .select('*')
        .eq('status', 'APPROVED')
        .order('created_at', { ascending: false });
      if (!cancelled) {
        setTemplates((data as MessageTemplate[]) ?? []);
        setLoadingTemplates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // When the template changes, initialize variable configs with
  // automatic personalization where a matching contact field exists.
  useEffect(() => {
    // reset dependent state
    setVars({});
    setHeaderText('');
    setUrlButtonVals({});
    if (!selectedTemplate) return;

    bodyVars.forEach((placeholder, i) => {
      // Prefer a matching contact field for personalization.
      setVars((prev) => ({
        ...prev,
        [i]: {
          source: 'contact',
          value: 'name',
          resolved: resolveContactField('name'),
        },
      }));
    });
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolvedBody = useMemo(() => {
    const resolved: (string | undefined)[] = bodyVars.map((_, i) => {
      const cfg = vars[i];
      if (!cfg) return undefined;
      if (cfg.source === 'static') return cfg.value;
      // stored resolved value for contact source
      return (vars[i]?.resolved ?? '') || resolveContactField(cfg.value);
    });
    return resolvedBodyText(selectedTemplate?.body_text ?? '', resolved);
  }, [bodyVars, vars, selectedTemplate, contact]); // eslint-disable-line react-hooks/exhaustive-deps

  const canConfirm =
    !!selectedTemplate &&
    bodyVars.every((_, i) => {
      const cfg = vars[i];
      if (!cfg) return false;
      const val = cfg.source === 'contact' ? cfg.resolved : cfg.value;
      return (val ?? '').trim().length > 0;
    }) &&
    (headerVarCount === 0 || headerText.trim().length > 0) &&
    urlButtonSlots.every((s) => (urlButtonVals[s.index] ?? '').trim().length > 0);

  function updateVar(i: number, source: VariableSource, value: string | null) {
    setVars((prev) => {
      // base-ui Select reports null when cleared; keep the prior value then.
      const next = (value ?? prev[i]?.value ?? '').trim();
      const resolved =
        source === 'contact' ? resolveContactField(next) : next;
      return { ...prev, [i]: { source, value: next, resolved } };
    });
  }

  async function handleSend() {
    if (!selectedTemplate || !contact || !canConfirm) return;
    setSending(true);
    try {
      const bodyParams = bodyVars.map((_, i) => {
        const cfg = vars[i];
        if (!cfg) return '';
        return cfg.source === 'contact'
          ? cfg.resolved
          : cfg.value;
      });

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contact.id,
          message_type: 'template',
          template_name: selectedTemplate.name,
          template_language: selectedTemplate.language ?? 'en_US',
          template_message_params: {
            body: bodyParams,
            headerText: headerText.trim() || undefined,
            buttonParams:
              Object.keys(urlButtonVals).length > 0 ? urlButtonVals : undefined,
          },
          template_params: bodyParams,
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const reason = payload?.error || `HTTP ${res.status}`;
        toast.error(`Message could not be sent. ${reason}`);
        return;
      }

      setSentOk(true);
      toast.success(`Message sent to ${contact.name || contact.phone}`);
      onSent?.();
    } catch {
      toast.error('Message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function saveOptOut(next: boolean) {
    if (!contact) return;
    setSavingOptOut(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('contacts')
      .update({
        messaging_opt_out: next,
        opted_out_reason: next ? optOutReason.trim() || null : null,
        opted_out_at: next ? new Date().toISOString() : null,
      })
      .eq('id', contact.id);
    setSavingOptOut(false);
    if (error) {
      toast.error('Could not update messaging preference.');
      return;
    }
    toast.success(next ? 'Opted out of WhatsApp messaging' : 'Messaging re-enabled');
    onSent?.();
  }

  /**
   * Open this contact's conversation in the CRM Inbox, where a normal
   * free-text WhatsApp message can be typed and sent (inside the 24h
   * customer-service window). Reuses a conversation if one already
   * exists; otherwise creates it (account-scoped, mirroring the
   * send route's find-or-create) — never duplicates a thread.
   */
  async function openInbox() {
    if (!contact || openingInbox) return;
    if (!accountId || !user?.id) {
      toast.error('Your session is still loading. Please try again.');
      return;
    }
    setOpeningInbox(true);
    try {
      const supabase = createClient();
      let conversationId: string | null = null;

      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .maybeSingle();
      conversationId = existing?.id ?? null;

      if (!conversationId) {
        const { data: created, error } = await supabase
          .from('conversations')
          .insert({
            account_id: accountId,
            user_id: user?.id,
            contact_id: contact.id,
          })
          .select('id')
          .single();
        if (error || !created) {
          toast.error('Could not open a conversation for this contact.');
          return;
        }
        conversationId = created.id;
      }

      onOpenChange(false);
      router.push(`/inbox?c=${conversationId}`);
    } catch {
      toast.error('Could not open the conversation.');
    } finally {
      setOpeningInbox(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <MessageSquare className="h-4 w-4 text-primary" />
            Send WhatsApp Message
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Send an approved template to this contact. Business-initiated
            messages must use an approved WhatsApp template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contact summary */}
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                {contact?.name
                  ? contact.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                  : '?'}
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-popover-foreground">
                  {contact?.name || 'Unknown'}
                  {contact?.messaging_opt_out && (
                    <Badge variant="destructive" className="text-[10px]">
                      Opted Out
                    </Badge>
                  )}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {contact?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" /> {contact.phone}
                    </span>
                  )}
                  {contact?.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="size-3" /> {contact.email}
                    </span>
                  )}
                  {contact?.company && (
                    <span className="flex items-center gap-1">
                      <Building2 className="size-3" /> {contact.company}
                    </span>
                  )}
                  {contact?.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" /> {contact.location}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {contact?.messaging_opt_out && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <ShieldAlert className="size-4 shrink-0" />
              <span>
                This contact has opted out of WhatsApp messaging
                {contact.opted_out_reason ? ` — ${contact.opted_out_reason}` : ''}.
                Sending to them is blocked. You can re-enable messaging below if
                you have authorization.
              </span>
            </div>
          )}

          {/* Template selection */}
          <div className="space-y-1.5">
            <Label className="text-xs text-popover-foreground">Message Type</Label>
            <Select
              value={templateId}
              onValueChange={(v) => setTemplateId(v ?? '')}
              disabled={!canSend || contact?.messaging_opt_out}
            >
              <SelectTrigger className="h-9 w-full border-border bg-muted text-foreground">
                <SelectValue placeholder="Select template…" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {loadingTemplates ? (
                  <SelectItem value="__loading" disabled>
                    Loading templates…
                  </SelectItem>
                ) : templates.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No approved templates yet
                  </SelectItem>
                ) : (
                  templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {formatTemplateName(t)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplate && (
            <>
              {/* Template meta */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className="border border-primary/30 bg-primary/20 text-[10px] text-primary">
                  {selectedTemplate.category}
                </Badge>
                {selectedTemplate.language && (
                  <span className="uppercase text-muted-foreground">
                    {selectedTemplate.language}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Approved
                </span>
              </div>

              {/* Preview */}
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <p className="mb-1 text-xs text-muted-foreground">Message Preview</p>
                <p className="whitespace-pre-wrap text-sm text-popover-foreground">
                  {resolvedBody}
                </p>
                {selectedTemplate.footer_text && (
                  <p className="mt-2 text-xs italic text-muted-foreground">
                    {selectedTemplate.footer_text}
                  </p>
                )}
              </div>

              {/* Variable inputs */}
              <div className="space-y-2.5">
                {(selectedTemplate.header_type === 'text' ||
                  headerVarCount > 0) &&
                  headerVarCount > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs text-popover-foreground">
                        Header — value for {'{{1}}'}
                      </Label>
                      <Input
                        value={headerText}
                        onChange={(e) => setHeaderText(e.target.value)}
                        placeholder="Header text"
                        className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                  )}

                {bodyVars.map((placeholder, i) => (
                  <div key={placeholder} className="space-y-1.5">
                    <Label className="text-xs text-popover-foreground">
                      {'{{' + placeholder + '}}'}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={vars[i]?.source ?? 'contact'}
                        onValueChange={(v) => {
                          const source = v as VariableSource;
                          const defVal = source === 'contact' ? 'name' : '';
                          const resolved =
                            source === 'contact'
                              ? resolveContactField(defVal)
                              : '';
                          setVars((prev) => ({
                            ...prev,
                            [i]: { source, value: defVal, resolved },
                          }));
                        }}
                      >
                        <SelectTrigger className="h-9 w-40 border-border bg-muted text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          <SelectItem value="contact">Use contact field</SelectItem>
                          <SelectItem value="static">Type manually</SelectItem>
                        </SelectContent>
                      </Select>
                      {vars[i]?.source === 'contact' ? (
                        <Select
                          value={vars[i]?.value ?? 'name'}
                          onValueChange={(v) => updateVar(i, 'contact', v)}
                        >
                          <SelectTrigger className="h-9 flex-1 border-border bg-muted text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-popover border-border">
                            {PERSONALIZABLE_FIELDS.map((f) => (
                              <SelectItem key={f.key} value={f.key}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={vars[i]?.value ?? ''}
                          onChange={(e) => updateVar(i, 'static', e.target.value)}
                          placeholder={`Value for {{${placeholder}}}`}
                          className="h-9 flex-1 border-border bg-muted text-foreground placeholder:text-muted-foreground"
                        />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Resolves to: {(vars[i]?.resolved ?? '').trim() || '—'}
                    </p>
                  </div>
                ))}

                {urlButtonSlots.map((slot) => (
                  <div key={slot.index} className="space-y-1">
                    <Label className="text-xs text-popover-foreground">
                      {'URL button &quot;' + slot.text + '&quot;'} — value for {'{{1}}'}
                    </Label>
                    <Input
                      value={urlButtonVals[slot.index] ?? ''}
                      onChange={(e) =>
                        setUrlButtonVals((prev) => ({
                          ...prev,
                          [slot.index]: e.target.value,
                        }))
                      }
                      placeholder="Button value"
                      className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                    />
                    <p className="break-all text-[10px] text-muted-foreground">
                      {slot.url.replace(
                        /\{\{1\}\}/g,
                        urlButtonVals[slot.index] || '{{1}}',
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          {sentOk && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              Message sent. It will appear in the Inbox and this contact&apos;s activity.
            </div>
          )}

          {/* Opt-out management */}
          <div className="space-y-2 border-t border-border/70 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-popover-foreground">
                  WhatsApp Messaging
                </p>
                <p className="text-xs text-muted-foreground">
                  {contact?.messaging_opt_out ? 'Opted Out' : 'Allowed'}
                </p>
              </div>
              <Switch
                checked={!optOut}
                onCheckedChange={(v) => {
                  const next = !v;
                  setOptOut(next);
                  if (!next) void saveOptOut(false);
                }}
              />
            </div>
            {optOut && (
              <div className="space-y-2">
                <Input
                  value={optOutReason}
                  onChange={(e) => setOptOutReason(e.target.value)}
                  placeholder="Reason for opting out (optional)"
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingOptOut}
                  onClick={() => void saveOptOut(true)}
                  className="border-border text-muted-foreground hover:bg-muted"
                >
                  {savingOptOut && <Loader2 className="size-3 animate-spin" />}
                  Save opt-out
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={openInbox}
            disabled={openingInbox || !contact}
            title={
              contact?.messaging_opt_out
                ? 'This contact has opted out; free-text is blocked, use a template.'
                : undefined
            }
            className="border-border text-popover-foreground hover:bg-muted disabled:opacity-50"
          >
            {openingInbox ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Inbox className="size-4" />
            )}
            Open in Inbox
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-popover-foreground hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            disabled={!canConfirm || sending || !canSend || contact?.messaging_opt_out}
            onClick={handleSend}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {sending ? 'Sending…' : 'Send Message'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function resolvedBodyText(
  body: string,
  resolved: (string | undefined)[],
): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1;
    const value = resolved[idx];
    return value && value.trim().length > 0 ? value : `{{${raw}}}`;
  });
}
