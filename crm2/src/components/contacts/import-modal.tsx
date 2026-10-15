'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  parseImportFile,
  autoMapColumns,
  validateMappedRow,
  buildContactRow,
  parseCreatedDate,
  type ParsedFile,
  type ColumnMapping,
  type MappingTarget,
} from '@/lib/contacts/import-data';
import {
  CONTACT_FIELDS,
  CONTACT_FIELDS_BY_KEY,
  REQUIRED_IMPORT_FIELDS,
  LEAD_STATUS_VALUES,
  SUGGESTED_CATEGORIES,
  type ContactColumnKey,
} from '@/lib/contacts/contact-fields';
import { dedupeByPhone, isUniqueViolation, normalizeKey } from '@/lib/contacts/dedupe';
import {
  resolveImportTagIds,
  assignImportedContactTags,
  type ContactTagAssignment,
} from '@/lib/contacts/resolve-import-tags';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Columns3,
  Search,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

type Step =
  | 'upload'
  | 'preview'
  | 'map'
  | 'validate'
  | 'confirm'
  | 'importing'
  | 'results';

const DEFAULT_TAG_COLOR = '#3b82f6';

interface BuiltRow {
  contact: ReturnType<typeof buildContactRow>;
  values: Record<string, string>;
  errors: string[];
  rowIndex: number;
}

interface ImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  tagsAssigned: number;
  customAssigned: number;
  needsReview: { rowIndex: number; phone: string; name: string; reason: string }[];
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

function truncateFilename(name: string, max = 48): string {
  if (name.length <= max) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, name.length - ext.length);
  const keep = max - ext.length - 1;
  return `${base.slice(0, Math.max(keep, 12))}…${ext}`;
}

export function ImportModal({ open, onOpenChange, onImported }: ImportModalProps) {
  const t = useTranslations('Contacts.importModal');
  const supabase = createClient();
  const { accountId, canEditSettings } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [previewCols, setPreviewCols] = useState<string[]>([]);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewFilter, setPreviewFilter] = useState<{
    field: string;
    op: string;
    value: string;
  } | null>(null);
  const [existingByNorm, setExistingByNorm] = useState<Map<string, string>>(
    new Map()
  );
  const [dupMode, setDupMode] = useState<'skip' | 'update' | 'create'>('skip');
  const [fieldSearch, setFieldSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setStep('upload');
    setFile(null);
    setParsed(null);
    setMapping([]);
    setPreviewCols([]);
    setPreviewSearch('');
    setPreviewFilter(null);
    setExistingByNorm(new Map());
    setDupMode('skip');
    setFieldSearch('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setStep('upload');
    try {
      const data = await parseImportFile(selected);
      if (data.headers.length === 0 || data.rows.length === 0) {
        toast.error(t('toastNoValidRows'));
        return;
      }
      const mapped = autoMapColumns(data.headers);
      setParsed(data);
      setMapping(mapped);
      // Default preview columns = every detected column in the file, so no
      // imported field is silently hidden or discarded. The "Preview Columns"
      // toggle only hides/shows them for display; underlying data is preserved.
      setPreviewCols(data.headers.slice());
      // Load existing contact normalized phones for duplicate detection.
      if (accountId) {
        const { data: existing } = await supabase
          .from('contacts')
          .select('id, phone_normalized')
          .eq('account_id', accountId);
        const map = new Map<string, string>();
        for (const r of existing ?? []) {
          const norm = (r as { phone_normalized: string | null }).phone_normalized;
          if (norm) map.set(norm, (r as { id: string }).id);
        }
        setExistingByNorm(map);
      }
      setStep('preview');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('toastError');
      toast.error(`Could not parse file: ${message}`);
    }
  }

  const builtRows: BuiltRow[] = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((rowValues, rowIndex) => {
      const values: Record<string, string> = {};
      parsed.headers.forEach((h, i) => (values[h] = rowValues[i] ?? ''));
      const contact = buildContactRow(values, mapping);
      const errors = validateMappedRow(values, mapping);
      return { contact, values, errors, rowIndex };
    });
  }, [parsed, mapping]);

  // Rows that pass immediate structural checks (has phone + no errors).
  const validRows = useMemo(
    () => builtRows.filter((r) => r.contact.phone && r.errors.length === 0),
    [builtRows]
  );

  const { inFileDupes, uniqueRows } = useMemo(() => {
    const src = validRows.map((r) => ({ key: r.contact.phone, row: r }));
    const seen = new Set<string>();
    const unique: BuiltRow[] = [];
    let dupes = 0;
    for (const s of src) {
      const k = normalizeKey(s.key);
      if (!k || seen.has(k)) {
        dupes++;
        continue;
      }
      seen.add(k);
      unique.push(s.row);
    }
    return { inFileDupes: dupes, uniqueRows: unique };
  }, [validRows]);

  const previewRows = useMemo(() => {
    if (!parsed) return [];
    return builtRows.filter((r) => {
      if (previewSearch.trim()) {
        const q = previewSearch.trim().toLowerCase();
        const haystack = Object.keys(r.contact)
          .map((k) => {
            const v = (r.contact as Record<string, unknown>)[k];
            return typeof v === 'string' ? v : Array.isArray(v) ? v.join(',') : v != null ? String(v) : '';
          })
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (previewFilter) {
        const v = (r.values[previewFilter.field] ?? '').toLowerCase();
        const fv = previewFilter.value.toLowerCase();
        if (previewFilter.op === 'contains' && !v.includes(fv)) return false;
        if (previewFilter.op === 'eq' && v !== fv) return false;
        if (['gte', 'gt', 'lte', 'lt'].includes(previewFilter.op)) {
          const n = Number(r.values[previewFilter.field]);
          const target = Number(previewFilter.value);
          if (Number.isNaN(n) || Number.isNaN(target)) return previewFilter.op === 'lte' || previewFilter.op === 'gte' ? n <= target || n >= target : false;
          if (previewFilter.op === 'gte' && !(n >= target)) return false;
          if (previewFilter.op === 'gt' && !(n > target)) return false;
          if (previewFilter.op === 'lte' && !(n <= target)) return false;
          if (previewFilter.op === 'lt' && !(n < target)) return false;
        }
      }
      return true;
    });
  }, [parsed, builtRows, previewSearch, previewFilter]);

  const validateSummary = useMemo(() => {
    if (!parsed) return { total: 0, valid: 0, invalid: 0, inFileDupes: 0, existing: 0 };
    let valid = 0;
    let invalid = 0;
    let existing = 0;
    for (const r of uniqueRows) {
      const norm = normalizeKey(r.contact.phone);
      if (existingByNorm.has(norm)) {
        existing++;
        continue;
      }
      valid++;
    }
    for (const r of builtRows) {
      if (!r.contact.phone || r.errors.length > 0) invalid++;
    }
    return {
      total: builtRows.length,
      valid,
      invalid,
      inFileDupes,
      existing,
    };
  }, [parsed, builtRows, uniqueRows, existingByNorm, inFileDupes]);

  const mappedRequired = useMemo(
    () =>
      REQUIRED_IMPORT_FIELDS.filter((f) => mapping.some((m) => m.target === f.key)),
    [mapping]
  );

  // Every column detected in the uploaded file (mapped, custom, or unmapped).
  // The preview shows all of these by default so no imported field is hidden.
  const allDetectedColumns = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers.map((header) => {
      const m = mapping.find((x) => x.header === header);
      let targetLabel: string;
      if (!m || m.target === 'unmapped') targetLabel = 'Not mapped';
      else if (m.target === 'custom') targetLabel = m.customFieldKey || 'Custom field';
      else targetLabel = CONTACT_FIELDS_BY_KEY[m.target].label;
      return { header, label: header, targetLabel };
    });
  }, [parsed, mapping]);

  function setMappingTarget(header: string, target: MappingTarget) {
    setMapping((prev) =>
      prev.map((m) => (m.header === header ? { ...m, target } : m))
    );
  }

  async function runImport() {
    if (!parsed || !accountId) return;
    setStep('importing');
    setImporting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;

      // Resolve once: custom field columns -> ids.
      const customCols = mapping.filter((m) => m.target === 'custom');
      const customFieldIdByName = new Map<string, string>();
      for (const col of customCols) {
        const name = (col.customFieldKey || col.header).trim();
        if (!name) continue;
        if (customFieldIdByName.has(name)) continue;
        const { data: existingCf } = await supabase
          .from('custom_fields')
          .select('id')
          .eq('account_id', accountId)
          .ilike('field_name', name)
          .maybeSingle();
        if (existingCf) {
          customFieldIdByName.set(name, existingCf.id);
        } else {
          const { data: created, error } = await supabase
            .from('custom_fields')
            .insert({
              user_id: user.id,
              account_id: accountId,
              field_name: name,
              field_type: 'text',
            })
            .select('id')
            .single();
          if (!error && created) customFieldIdByName.set(name, created.id);
        }
      }

      // Resolve tag names.
      const allTagNames = uniqueRows.flatMap((r) => r.contact.tagNames);
      let tagIdByKey = new Map<string, string>();
      let skippedNames: string[] = [];
      if (allTagNames.length > 0) {
        ({ tagIdByKey, skippedNames } = await resolveImportTagIds(supabase, {
          accountId,
          userId: user.id,
          tagNames: allTagNames,
          canCreateTags: canEditSettings,
        }));
      }

      const tagAssignments: ContactTagAssignment[] = [];
      const customAssignments: { contactId: string; fieldId: string; value: string }[] = [];

      const collectAssociations = (
        rec: { id: string },
        source: ReturnType<typeof buildContactRow>
      ) => {
        if (source.tagNames.length > 0) {
          tagAssignments.push({
            contactId: rec.id,
            tagNames: source.tagNames,
          });
        }
        for (const [name, val] of Object.entries(source.custom)) {
          const fieldId = customFieldIdByName.get(name);
          if (fieldId) customAssignments.push({ contactId: rec.id, fieldId, value: val });
        }
      };

      const chunkSize = 50;
      for (let i = 0; i < uniqueRows.length; i += chunkSize) {
        const chunk = uniqueRows.slice(i, i + chunkSize);
        const rows = chunk.map((r) => {
          const c = r.contact;
          const row: Record<string, unknown> = {
            user_id: user.id,
            account_id: accountId,
            phone: c.phone,
            name: c.name || null,
            email: c.email || null,
            company: c.company || null,
            country: c.country || null,
            location: c.location || null,
            category: c.category || null,
            address: c.address || null,
            website: c.website || null,
            rating: c.rating ?? null,
            review_count: c.review_count ?? null,
            lead_status:
              c.lead_status && LEAD_STATUS_VALUES.includes(c.lead_status.toLowerCase())
                ? c.lead_status.toLowerCase()
                : null,
            imported_at: new Date().toISOString(),
          };
          const cd = parseCreatedDate(c.created_at);
          if (cd) row.created_at = cd;
          return { row, source: c, index: chunk.indexOf(r) };
        });

        // Duplicate handling per row.
        const toInsert: typeof rows = [];
        const toUpdate: { row: typeof rows[number]; existingId: string }[] = [];
        for (const entry of rows) {
          const norm = normalizeKey(entry.row.phone as string);
          const existingId = existingByNorm.get(norm);
          if (existingId) {
            if (dupMode === 'skip') {
              skipped++;
              continue;
            } else if (dupMode === 'update') {
              toUpdate.push({ row: entry, existingId });
              continue;
            }
            // create -> fall through to insert; unique index will catch races
          }
          if (!norm) {
            failed++;
            continue;
          }
          toInsert.push(entry);
        }

        // Batch insert new rows.
        if (toInsert.length > 0) {
          const insertPayload = toInsert.map((e) => e.row);
          const { data, error } = await supabase
            .from('contacts')
            .insert(insertPayload)
            .select('id');
          if (error) {
            for (const entry of toInsert) {
              const { data: single, error: err } = await supabase
                .from('contacts')
                .insert(entry.row)
                .select('id')
                .single();
              if (!err && single) {
                imported++;
                collectAssociations(single, entry.source);
              } else if (isUniqueViolation(err)) {
                skipped++;
              } else {
                failed++;
              }
            }
          } else {
            const inserted = data ?? [];
            for (let j = 0; j < inserted.length; j++) {
              imported++;
              collectAssociations(inserted[j], toInsert[j].source);
            }
          }
        }

        // Update existing duplicates.
        for (const entry of toUpdate) {
          const c = entry.row.source;
          const update = {
            name: c.name || null,
            email: c.email || null,
            company: c.company || null,
            country: c.country || null,
            location: c.location || null,
            category: c.category || null,
            address: c.address || null,
            website: c.website || null,
            rating: c.rating ?? null,
            review_count: c.review_count ?? null,
            lead_status:
              c.lead_status && LEAD_STATUS_VALUES.includes(c.lead_status.toLowerCase())
                ? c.lead_status.toLowerCase()
                : null,
            updated_at: new Date().toISOString(),
          };
          const cd = parseCreatedDate(c.created_at);
          if (cd) (update as Record<string, unknown>).created_at = cd;
          const { error } = await supabase
            .from('contacts')
            .update(update)
            .eq('id', entry.existingId);
          if (error) failed++;
          else {
            updated++;
            collectAssociations({ id: entry.existingId }, c);
          }
        }
      }

      // Wire tags.
      let tagsAssigned = 0;
      try {
        tagsAssigned = await assignImportedContactTags(supabase, tagAssignments, tagIdByKey);
      } catch {
        toast.warning(t('toastTagsWarning'));
      }

      // Wire custom field values.
      let customAssigned = 0;
      try {
        if (customAssignments.length > 0) {
          const rows = customAssignments.map((a) => ({
            contact_id: a.contactId,
            custom_field_id: a.fieldId,
            value: a.value,
          }));
          const { error } = await supabase
            .from('contact_custom_values')
            .upsert(rows, { onConflict: 'contact_id,custom_field_id' });
          if (!error) customAssigned = customAssignments.length;
        }
      } catch {
        /* custom fields optional */
      }

      setResult({
        total: builtRows.length,
        imported,
        updated,
        skipped,
        failed,
        tagsAssigned,
        customAssigned,
        needsReview: builtRows
          .filter((r) => !r.contact.phone || r.errors.length > 0)
          .map((r) => ({
            rowIndex: r.rowIndex,
            phone: r.contact.phone,
            name: r.contact.name ?? '',
            reason: r.errors.join('; ') || 'Invalid row',
          })),
      });
      setStep('results');
      if (imported + updated > 0) onImported();
      if (imported > 0) toast.success(t('toastImported', { count: imported }));
      if (skippedNames.length > 0) {
        const sample = skippedNames.slice(0, 3).join(', ');
        const more = skippedNames.length > 3 ? ` (+${skippedNames.length - 3} more)` : '';
        toast.info(t('toastTagsSkipped', { sample, more }));
      }
      if (skipped > 0) toast.info(t('toastSkipped', { count: skipped }));
      if (failed > 0) toast.error(t('toastFailed', { count: failed }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('toastError');
      toast.error(message);
      setStep('validate');
    } finally {
      setImporting(false);
    }
  }

  const back = () => setStep((s) => (s === 'upload' ? 'upload' : s === 'preview' ? 'upload' : s === 'map' ? 'preview' : s === 'validate' ? 'map' : s));

  const labelFor = (key: ContactColumnKey) => CONTACT_FIELDS_BY_KEY[key]?.label ?? key;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,760px)] flex-col gap-0 overflow-hidden border-border/80 bg-popover p-0 text-popover-foreground sm:max-w-4xl">
        <div className="shrink-0 space-y-3 border-b border-border/80 px-6 pt-5 pb-4">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-lg text-popover-foreground">
              {t('title')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {result
                ? 'Import summary'
                : step === 'upload'
                  ? 'Upload a CSV or Excel file'
                  : step === 'preview'
                    ? 'Review the detected data before mapping'
                    : step === 'map'
                      ? 'Map file columns to CRM fields'
                      : step === 'validate'
                        ? 'Validate and choose how to handle duplicates'
                        : step === 'confirm'
                          ? t('title')
                          : 'Importing…'}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          {!result && step !== 'importing' && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {(
                ['upload', 'preview', 'map', 'validate', 'confirm'] as Step[]
              ).map((s, i) => {
                const current = step === s || (step === 'results' && s === 'confirm');
                const done =
                  (['preview', 'map', 'validate', 'confirm'] as Step[]).indexOf(step) > i ||
                  step === 'results';
                return (
                  <span
                    key={s}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium capitalize',
                      done
                        ? 'bg-primary/15 text-primary'
                        : current
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <span>{done ? <CheckCircle className="size-3" /> : i + 1}</span>
                    {s}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {/* UPLOAD */}
          {step === 'upload' && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 transition-all hover:border-primary/40 border-border/80 bg-background/40 hover:bg-background/70"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted/80 ring-1 ring-border/80 transition-colors group-hover:bg-muted">
                <Upload className="size-5 text-muted-foreground group-hover:text-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t('uploadDropzone')}</p>
              <p className="text-[11px] text-muted-foreground">
                Accepts .csv, .xlsx, .xls • auto-detects Country, Location, Category, Name,
                Address, Phone, Email, Website, Rating, Reviews, Lead Status, Tags, Created
              </p>
              {file && (
                <p className="text-xs text-popover-foreground">{truncateFilename(file.name)}</p>
              )}
            </div>
          )}

          {/* PREVIEW */}
          {step === 'preview' && parsed && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-popover-foreground">
                  Import Preview —{' '}
                  <span className="text-muted-foreground">
                    {parsed.rows.length.toLocaleString()} rows detected
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      value={previewSearch}
                      onChange={(e) => setPreviewSearch(e.target.value)}
                      placeholder="Search preview…"
                      className="w-48 pl-8 bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Columns3 className="size-4 text-muted-foreground" />
    <Select value={previewFilter?.field ?? 'none'}
      onValueChange={(v) =>
        setPreviewFilter(
          v === 'none' ? null : { field: v as string, op: 'contains', value: '' }
        )
      }
    >
      <SelectTrigger className="h-8 bg-muted border-border text-muted-foreground text-xs">
        <SelectValue placeholder="Filter" />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        <SelectItem value="none">No filter</SelectItem>
        {allDetectedColumns.map((c) => (
          <SelectItem key={c.header} value={c.header}>{c.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
                    {previewFilter && (
                      <Input
                        value={previewFilter.value}
                        onChange={(e) =>
                          setPreviewFilter({ ...previewFilter, value: e.target.value })
                        }
                        placeholder="value"
                        className="w-24 bg-muted border-border text-foreground h-8 text-xs"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Preview column picker */}
              <div className="rounded-lg border border-border/70 bg-background/40 p-2.5">
                <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Preview Columns
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allDetectedColumns.map((c) => {
                    const on = previewCols.includes(c.header);
                    return (
                      <button
                        key={c.header}
                        onClick={() =>
                          setPreviewCols((prev) =>
                            on ? prev.filter((k) => k !== c.header) : [...prev, c.header]
                          )
                        }
                        title={`Maps to: ${c.targetLabel}`}
                        className={cn(
                          'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                          on
                            ? 'bg-primary/15 text-primary'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {on ? '☑' : '☐'} {c.label}
                      </button>
                    );
                  })}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    Showing {allDetectedColumns.filter((c) => previewCols.includes(c.header)).length}/
                    {allDetectedColumns.length} detected
                  </span>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border ring-1 ring-border/50">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-border bg-background/90 backdrop-blur">
                        {allDetectedColumns
                          .filter((c) => previewCols.includes(c.header))
                          .map((c) => (
                            <th
                              key={c.header}
                              className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground"
                            >
                              {c.label}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {previewRows.slice(0, 20).map((r) => (
                        <tr key={r.rowIndex} className="bg-popover/40 hover:bg-muted/30">
                          {allDetectedColumns
                            .filter((c) => previewCols.includes(c.header))
                            .map((c) => (
                              <td key={c.header} className="px-3 py-2 text-muted-foreground">
                                <span
                                  className="block max-w-[11rem] truncate"
                                  title={r.values[c.header]}
                                >
                                  {r.values[c.header]}
                                </span>
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {previewRows.length > 20 && (
                <p className="text-center text-[11px] text-muted-foreground">
                  Showing first 20 of {previewRows.length.toLocaleString()} matching rows
                </p>
              )}
            </div>
          )}

          {/* MAP */}
          {step === 'map' && parsed && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-2.5">
                <p className="text-xs text-emerald-200">
                  {mappedRequired.length}/{REQUIRED_IMPORT_FIELDS.length} required fields mapped
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Search columns…"
                  className="pl-8 bg-muted border-border text-foreground h-8 text-sm"
                />
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-background/60">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">File Column</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Maps to CRM Field</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {mapping
                      .filter((m) => m.header.toLowerCase().includes(fieldSearch.toLowerCase()))
                      .map((m) => {
                        const isCustom = m.target === 'custom';
                        return (
                          <tr key={m.header} className="bg-popover/40">
                            <td className="px-3 py-2 text-popover-foreground font-medium">
                              {m.header}
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                value={m.target === 'custom' ? 'custom' : m.target}
                                onValueChange={(v) =>
                                  setMappingTarget(m.header, v as MappingTarget)
                                }
                              >
                                <SelectTrigger className="h-7 bg-muted border-border text-xs text-muted-foreground w-56">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border-border">
                                  <SelectItem value="unmapped">(Don&apos;t import)</SelectItem>
                                  {CONTACT_FIELDS.map((f) => (
                                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                                  ))}
                                  <SelectItem value="custom">Create Custom Field…</SelectItem>
                                </SelectContent>
                              </Select>
                              {isCustom && (
                                <Input
                                  value={m.customFieldKey ?? m.header}
                                  onChange={(e) =>
                                    setMapping((prev) =>
                                      prev.map((x) =>
                                        x.header === m.header
                                          ? { ...x, customFieldKey: e.target.value }
                                          : x
                                      )
                                    )
                                  }
                                  placeholder="Custom field name"
                                  className="mt-1 h-7 w-56 bg-muted border-border text-foreground text-xs"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {mappedRequired.length < REQUIRED_IMPORT_FIELDS.length && (
                <p className="text-[11px] text-amber-300">
                  Tip: map these recommended columns to unlock full business-lead fields:
                  {' '}
                  {REQUIRED_IMPORT_FIELDS.filter(
                    (f) => !mapping.some((m) => m.target === f.key)
                  )
                    .map((f) => f.label)
                    .join(', ')}
                </p>
              )}
            </div>
          )}

          {/* VALIDATE */}
          {step === 'validate' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryChip label="Total rows" value={validateSummary.total} />
                <SummaryChip label="Valid (new)" value={validateSummary.valid} tone="green" />
                <SummaryChip label="In-file duplicates" value={validateSummary.inFileDupes} tone="amber" />
                <SummaryChip label="Already in CRM" value={validateSummary.existing} tone="amber" />
              </div>
              {validateSummary.invalid > 0 && (
                <div className="rounded-lg border border-red-700/40 bg-red-950/20 p-2.5 text-xs text-red-200">
                  {validateSummary.invalid} row(s) have invalid data and will be skipped.{' '}
                  Hover a row below to see why.
                </div>
              )}

              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Duplicate handling
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['skip', 'Skip duplicates'],
                      ['update', 'Update existing'],
                      ['create', 'Create as new'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setDupMode(val)}
                      className={cn(
                        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                        dupMode === val
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    placeholder="Search rows…"
                    className="pl-8 bg-muted border-border text-foreground h-8 text-sm"
                  />
                </div>
                <Select
                  value={previewFilter?.field ?? 'none'}
                  onValueChange={(v) =>
                    setPreviewFilter(
                      v === 'none' ? null : { field: v as string, op: 'contains', value: '' }
                    )
                  }
                >
                  <SelectTrigger className="h-8 bg-muted border-border text-muted-foreground text-xs">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="none">No filter</SelectItem>
                    {allDetectedColumns.map((c) => (
                      <SelectItem key={c.header} value={c.header}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-hidden rounded-xl border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-border bg-background/90 backdrop-blur">
                        <th className="w-8 px-2 py-2" />
                        {(['phone', 'name', 'category', 'location'] as ContactColumnKey[]).map(
                          (c) => (
                            <th key={c} className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                              {labelFor(c)}
                            </th>
                          )
                        )}
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {previewRows.slice(0, 30).map((r) => {
                        const dup =
                          normalizeKey(r.contact.phone) && existingByNorm.has(normalizeKey(r.contact.phone));
                        const invalid = !r.contact.phone || r.errors.length > 0;
                        return (
                          <tr key={r.rowIndex} className="bg-popover/40" title={r.errors.join('; ')}>
                            <td className="px-2 py-2">
                              {invalid ? (
                                <XCircle className="size-3.5 text-red-400" />
                              ) : dup ? (
                                <AlertTriangle className="size-3.5 text-amber-400" />
                              ) : (
                                <CheckCircle className="size-3.5 text-emerald-400" />
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground font-mono">{r.contact.phone}</td>
                            <td className="px-3 py-2 text-popover-foreground">{r.contact.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.contact.category}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.contact.location}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {invalid ? (
                                <span className="text-red-400">{r.errors[0]}</span>
                              ) : dup ? (
                                <span className="text-amber-300">
                                  {dupMode === 'update' ? 'Will update' : dupMode === 'create' ? 'Will create' : 'Duplicate'}
                                </span>
                              ) : (
                                <span className="text-emerald-400">Valid</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* CONFIRM */}
          {step === 'confirm' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-popover-foreground">Ready to Import</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryChip label="Total rows" value={validateSummary.total} />
                <SummaryChip label="Valid (new)" value={validateSummary.valid} tone="green" />
                <SummaryChip label="In-file duplicates" value={validateSummary.inFileDupes} tone="amber" />
                <SummaryChip label="Already in CRM" value={validateSummary.existing} tone="amber" />
              </div>
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Fields detected
              </p>
              <div className="flex flex-wrap gap-1.5">
                {REQUIRED_IMPORT_FIELDS.map((f) => {
                  const on = mapping.some((m) => m.target === f.key);
                  return (
                    <span
                      key={f.key}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
                        on ? 'bg-emerald-950/30 text-emerald-300' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {on ? '✓' : '○'} {f.label}
                    </span>
                  );
                })}
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 p-2.5 text-xs text-muted-foreground">
                Duplicate mode: <strong className="text-foreground">
                  {dupMode === 'skip' ? 'Skip duplicates' : dupMode === 'update' ? 'Update existing' : 'Create as new'}
                </strong>
                {' '}• {validateSummary.valid.toLocaleString()} new + {validateSummary.existing.toLocaleString()} existing
                {' '}({dupMode === 'skip' ? 'will be skipped' : dupMode === 'update' ? 'will be updated' : 'will be duplicated'})
              </div>
            </div>
          )}

          {/* IMPORTING */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Importing contacts…</p>
            </div>
          )}

          {/* RESULTS */}
          {step === 'results' && result && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-popover-foreground">Import completed</p>
              <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-sm">
                <p className="text-muted-foreground">
                  Total rows:{' '}
                  <span className="font-semibold text-foreground">
                    {result.total.toLocaleString()}
                  </span>
                </p>
                <p className="text-emerald-400">
                  Imported: <span className="font-semibold">{result.imported.toLocaleString()}</span>
                  {result.updated > 0 && (
                    <span className="text-cyan-300"> (+{result.updated.toLocaleString()} updated)</span>
                  )}
                </p>
                {(result.skipped > 0 || result.failed > 0) && (
                  <p className="text-amber-300">
                    Needs review:{' '}
                    <span className="font-semibold">
                      {(result.skipped + result.failed).toLocaleString()}
                    </span>
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <SummaryChip label="Imported" value={result.imported} tone="green" />
                <SummaryChip label="Updated" value={result.updated} tone="cyan" />
                <SummaryChip label="Skipped" value={result.skipped} tone="amber" />
                <SummaryChip label="Failed" value={result.failed} tone={result.failed > 0 ? 'red' : 'gray'} />
                <SummaryChip label="Tags assigned" value={result.tagsAssigned} />
                <SummaryChip label="Custom fields set" value={result.customAssigned} />
              </div>

              {/* Rows that need review — shown so no invalid row silently
                  disappears. Lists each problematic row with its reason. */}
              {result.needsReview.length > 0 && (
                <div className="rounded-lg border border-red-700/40 bg-red-950/20 text-xs text-red-200">
                  <p className="px-3 py-2 font-semibold border-b border-red-700/30">
                    {result.needsReview.length} row(s) need review and were not imported
                  </p>
                  <div className="max-h-48 overflow-y-auto divide-y divide-red-700/20">
                    {result.needsReview.map((r) => (
                      <div key={r.rowIndex} className="flex items-start gap-2 px-3 py-1.5">
                        <span className="shrink-0 font-mono text-red-300">#{r.rowIndex + 2}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-popover-foreground">
                            {r.phone || r.name || '(no name)'}
                          </p>
                          <p className="text-red-300/80">{r.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                {result.imported > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                    <CheckCircle className="size-4" /> {result.imported.toLocaleString()} contacts added
                  </span>
                )}
                {result.updated > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-cyan-400">
                    <CheckCircle className="size-4" /> {result.updated.toLocaleString()} updated
                  </span>
                )}
                {result.failed > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-red-400">
                    <XCircle className="size-4" /> {result.failed.toLocaleString()} failed
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-0 shrink-0 gap-2 border-t border-border/80 bg-background/50 px-6 py-4 sm:justify-between">
          {(step === 'map' || step === 'validate' || step === 'confirm') && (
            <Button
              type="button"
              variant="outline"
              onClick={back}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {result ? 'Close' : 'Cancel'}
            </Button>
            {step === 'preview' && (
              <Button
                type="button"
                onClick={() => setStep('map')}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Map Fields <ArrowRight className="size-4" />
              </Button>
            )}
            {step === 'map' && (
              <Button
                type="button"
                onClick={() => setStep('validate')}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Validate <ArrowRight className="size-4" />
              </Button>
            )}
            {step === 'validate' && (
              <Button
                type="button"
                disabled={validateSummary.valid === 0 && validateSummary.existing === 0}
                onClick={() => setStep('confirm')}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Continue <ArrowRight className="size-4" />
              </Button>
            )}
            {step === 'confirm' && (
              <Button
                type="button"
                disabled={importing}
                onClick={runImport}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {importing && <Loader2 className="size-4 animate-spin" />}
                Import {validateSummary.valid.toLocaleString()} Contacts
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
      />
    </Dialog>
  );
}

function SummaryChip({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: number;
  tone?: 'green' | 'amber' | 'red' | 'cyan' | 'gray';
}) {
  const color = {
    green: 'text-emerald-400',
    amber: 'text-amber-300',
    red: 'text-red-400',
    cyan: 'text-cyan-300',
    gray: 'text-foreground',
  }[tone];
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
      <p className="text-lg font-semibold text-foreground">{value.toLocaleString()}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
