'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { MessageTemplate, TemplateButton } from '@/types';
import { templateStatusConfig } from '@/lib/template-status';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Image as ImageIcon,
  Video,
  FileText,
  Type,
  ExternalLink,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';

// Read-only template detail: full preview of header/body/footer/buttons,
// Meta approval metadata, and where this template can be used. The
// editing surface stays in the template manager (shared with Settings).

const CATEGORY_COLORS: Record<string, string> = {
  Marketing: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  Utility: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  Authentication: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
};

function HeaderIcon({ format }: { format?: string }) {
  if (format === 'image') return <ImageIcon className="h-4 w-4" />;
  if (format === 'video') return <Video className="h-4 w-4" />;
  if (format === 'document') return <FileText className="h-4 w-4" />;
  return <Type className="h-4 w-4" />;
}

export default function TemplateDetailPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const { accountId, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!accountId || !templateId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('message_templates')
          .select('*')
          .eq('id', templateId)
          .eq('account_id', accountId)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) {
          if (data) setTemplate(data as MessageTemplate);
          else setNotFound(true);
        }
      } catch (err) {
        console.error('Failed to load template:', err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, authLoading, templateId, supabase]);

  if (loading || authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !template) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            Template not found
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            It may have been deleted or belongs to another account.
          </p>
        </div>
      </div>
    );
  }

  const status = template.status ?? 'DRAFT';
  const statusDisplay = templateStatusConfig[status] ?? templateStatusConfig.DRAFT;
  const bodyVars = extractVariableIndices(template.body_text);
  const buttons: TemplateButton[] = Array.isArray(template.buttons)
    ? template.buttons
    : [];

  // Render the body with {{n}} placeholders highlighted.
  const bodyParts = template.body_text.split(/(\{\{\d+\}\})/g);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/templates"
          aria-label="Back to templates"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">
              {template.name}
            </h1>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusDisplay.classes}`}
            >
              {statusDisplay.label}
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                CATEGORY_COLORS[template.category] ??
                'border-border bg-muted text-muted-foreground'
              }`}
            >
              {template.category}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Language: {template.language ?? 'en_US'} &middot; Created{' '}
            {new Date(template.created_at).toLocaleDateString()}
          </p>
        </div>
        <Link
          href="/templates"
          className="hidden items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:inline-flex"
        >
          <Pencil className="h-3.5 w-3.5" />
          Manage
        </Link>
      </div>

      {(status === 'REJECTED' && template.rejection_reason) ||
      template.submission_error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Rejection / submission issue</p>
            <p className="mt-0.5 break-words">
              {template.rejection_reason ?? template.submission_error}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Phone-style preview */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Preview
            </h2>

            {/* Media header */}
            {template.header_type &&
              template.header_type !== 'text' &&
              template.header_media_url && (
                <div className="mb-3 overflow-hidden rounded-lg border border-border">
                  {template.header_type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={template.header_media_url}
                      alt={`${template.name} header`}
                      className="max-h-64 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-24 items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
                      <HeaderIcon format={template.header_type} />
                      {template.header_type === 'video'
                        ? 'Video header'
                        : 'Document header'}
                    </div>
                  )}
                </div>
              )}

            {/* Text header */}
            {template.header_type === 'text' && template.header_content && (
              <p className="mb-2 font-semibold text-foreground">
                {renderVars(template.header_content)}
              </p>
            )}

            {/* Body */}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {bodyParts.map((part, i) =>
                /^\{\{\d+\}\}$/.test(part) ? (
                  <span
                    key={i}
                    className="rounded bg-primary/10 px-1 font-mono text-primary"
                  >
                    {part}
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
            </p>

            {/* Footer */}
            {template.footer_text && (
              <p className="mt-3 text-xs italic text-muted-foreground">
                {template.footer_text}
              </p>
            )}

            {/* Buttons */}
            {buttons.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {buttons.map((btn, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2 text-sm text-primary"
                  >
                    {btn.type === 'URL' && (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    {btn.text}
                    {btn.type === 'URL' && btn.url && (
                      <span className="truncate text-xs text-muted-foreground">
                        ({btn.url})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Metadata sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Details
            </h2>
            <dl className="space-y-2.5 text-sm">
              <DetailRow label="Status" value={statusDisplay.label} />
              <DetailRow label="Category" value={template.category} />
              <DetailRow
                label="Quality"
                value={template.quality_score ?? '—'}
              />
              <DetailRow
                label="Meta template ID"
                value={template.meta_template_id ?? 'Not submitted'}
                mono
              />
              <DetailRow
                label="Last submitted"
                value={
                  template.last_submitted_at
                    ? new Date(template.last_submitted_at).toLocaleString()
                    : '—'
                }
              />
            </dl>
          </div>

          {bodyVars.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold text-foreground">
                Variables
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {bodyVars.map((idx) => (
                  <span
                    key={idx}
                    className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary"
                  >
                    &#123;&#123;{idx}&#125;&#125;
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Provide a value for each variable when sending via campaign,
                broadcast or automation.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              Use this template
            </h2>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/broadcasts/new"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Send as a broadcast
                </Link>
              </li>
              <li>Pick it in the inbox composer (approved only)</li>
              <li>
                Reference it in an automation&apos;s send-template step
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/templates"
      aria-label="Back to templates"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
    </Link>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={`break-all text-right ${
          mono ? 'font-mono text-xs' : ''
        } text-foreground`}
      >
        {value}
      </dd>
    </div>
  );
}

function renderVars(text: string): React.ReactNode[] {
  return text.split(/(\{\{\d+\}\})/g).map((part, i) =>
    /^\{\{\d+\}\}$/.test(part) ? (
      <span
        key={i}
        className="rounded bg-primary/10 px-0.5 font-mono text-primary"
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
