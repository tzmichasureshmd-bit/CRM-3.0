'use client';

import { useState } from 'react';
import {
  Sparkles,
  Bot,
  X,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import type {
  ContactRecord,
  DealRecord,
  PipelineStageRecord,
} from '@/lib/crm-pipeline-store';
import {
  parseNaturalLanguageDeal,
  checkDuplicates,
  type ParsedDealIntent,
  type DuplicateCheckResult,
} from '@/lib/deal-automation-engine';

interface DealAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  stages: PipelineStageRecord[];
  contacts: ContactRecord[];
  existingDeals: DealRecord[];
  onConfirmCreate: (params: {
    title: string;
    value: number;
    currency: string;
    stageId: string;
    contactId: string | null;
    notes: string;
    followUp?: {
      title: string;
      dueDate: string;
    } | null;
    rulesApplied: string[];
    originalPrompt: string;
  }) => Promise<{ success: boolean; dealId?: string; error?: string }>;
}

const SAMPLE_PROMPTS = [
  'Create a deal for ABC Enterprises worth ₹50,000, associate it with the existing contact if available, and help progress it through the sales pipeline based on the defined qualification and follow-up rules.',
  'Enterprise WhatsApp license for Acme Corp valued at $25,000 in Proposal stage, schedule follow-up in 3 days.',
  'Cloud integration deal for TechSolutions valued at €12,000 with qualification follow-up next week.',
];

export function DealAutomationModal({
  isOpen,
  onClose,
  stages,
  contacts,
  existingDeals,
  onConfirmCreate,
}: DealAutomationModalProps) {
  const [prompt, setPrompt] = useState(
    'Create a deal for ABC Enterprises worth ₹50,000, associate it with the existing contact if available, and help progress it through the sales pipeline based on the defined qualification and follow-up rules.'
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [parsed, setParsed] = useState<ParsedDealIntent | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCheckResult | null>(null);

  // Editable preview fields
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [stageId, setStageId] = useState('');
  const [contactId, setContactId] = useState('');
  const [notes, setNotes] = useState('');
  const [enableFollowUp, setEnableFollowUp] = useState(true);
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDays, setFollowUpDays] = useState(2);

  // Execution state
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    status: 'success' | 'error';
    message: string;
    dealId?: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAnalyze = async (textToAnalyze?: string) => {
    const rawText = (textToAnalyze ?? prompt).trim();
    if (!rawText) {
      setValidationError('Please enter a natural language deal instruction.');
      return;
    }

    setAnalyzing(true);
    setValidationError(null);
    setExecutionResult(null);

    try {
      // Call server-side API route for verification
      const res = await fetch('/api/v3/ai/deal-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawText,
          stages,
          contacts,
        }),
      });

      let parsedResult: ParsedDealIntent;
      if (res.ok) {
        const data = await res.json();
        parsedResult = data.parsed as ParsedDealIntent;
      } else {
        // Fallback to client-side deterministic rule engine
        parsedResult = parseNaturalLanguageDeal(rawText, stages, contacts);
      }

      setParsed(parsedResult);
      setTitle(parsedResult.title);
      setValue(parsedResult.value > 0 ? String(parsedResult.value) : '');
      setCurrency(parsedResult.currency);
      setStageId(parsedResult.stageId);
      setContactId(parsedResult.matchedContactId ?? '');
      setNotes(parsedResult.notes);
      setEnableFollowUp(parsedResult.needsFollowUp);
      setFollowUpTitle(parsedResult.followUpTitle);
      setFollowUpDays(parsedResult.followUpDays);

      // Check duplicates
      const dup = checkDuplicates(parsedResult.title, parsedResult.company, existingDeals);
      setDuplicateWarning(dup);
    } catch {
      // Offline fallback
      const parsedResult = parseNaturalLanguageDeal(rawText, stages, contacts);
      setParsed(parsedResult);
      setTitle(parsedResult.title);
      setValue(parsedResult.value > 0 ? String(parsedResult.value) : '');
      setCurrency(parsedResult.currency);
      setStageId(parsedResult.stageId);
      setContactId(parsedResult.matchedContactId ?? '');
      setNotes(parsedResult.notes);
      setEnableFollowUp(parsedResult.needsFollowUp);
      setFollowUpTitle(parsedResult.followUpTitle);
      setFollowUpDays(parsedResult.followUpDays);

      const dup = checkDuplicates(parsedResult.title, parsedResult.company, existingDeals);
      setDuplicateWarning(dup);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirm = async () => {
    setValidationError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setValidationError('Deal Title is required.');
      return;
    }

    const parsedNum = value.trim() === '' ? 0 : Number(value);
    if (isNaN(parsedNum) || parsedNum < 0) {
      setValidationError('Please enter a valid deal value.');
      return;
    }

    const targetStage = stages.find(s => s.id === stageId) ?? stages[0];
    const stageLower = (targetStage?.name ?? stageId).toLowerCase();

    // Safety guard: Require explicit intent for Won/Lost
    if (stageLower === 'won' || stageLower === 'lost') {
      const confirmMsg = `Are you certain you want to create this deal directly in the "${targetStage?.name}" stage? Deals are normally progressed through stages first.`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    setExecuting(true);
    try {
      const dueDate = new Date(Date.now() + followUpDays * 86_400_000).toISOString();
      const followUp = enableFollowUp
        ? {
            title: followUpTitle.trim() || `Follow up on ${trimmedTitle}`,
            dueDate,
          }
        : null;

      const res = await onConfirmCreate({
        title: trimmedTitle,
        value: parsedNum,
        currency,
        stageId: stageId || stages[0]?.id || 'new',
        contactId: contactId || null,
        notes,
        followUp,
        rulesApplied: parsed?.qualificationRules ?? [],
        originalPrompt: prompt,
      });

      if (res.success) {
        setExecutionResult({
          status: 'success',
          message: `Deal "${trimmedTitle}" successfully created and progression rules activated!`,
          dealId: res.dealId,
        });
      } else {
        setExecutionResult({
          status: 'error',
          message: res.error || 'Failed to create deal.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Execution error';
      setExecutionResult({
        status: 'error',
        message: msg,
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleReset = () => {
    setParsed(null);
    setDuplicateWarning(null);
    setExecutionResult(null);
    setValidationError(null);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        background: 'rgba(10, 16, 38, 0.45)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="crm-glass"
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 20,
          background: 'rgba(255, 255, 255, 0.96)',
          boxShadow: '0 24px 60px rgba(16, 25, 54, 0.22)',
          border: '1px solid rgba(130, 145, 190, 0.28)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(130, 145, 190, 0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(79, 109, 245, 0.06), rgba(139, 92, 246, 0.06))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #4f6df5, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: '0 4px 12px rgba(79, 109, 245, 0.3)',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 750, color: 'var(--crm-text-strong)' }}>
                Deal Automation Assistant
              </h2>
              <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 2 }}>
                Convert natural language instructions into validated CRM deals & progression rules
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--crm-text-muted)',
              padding: 4,
              borderRadius: 8,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Success Message Banner */}
          {executionResult?.status === 'success' && (
            <div
              style={{
                padding: '16px 18px',
                borderRadius: 14,
                background: 'rgba(40, 201, 154, 0.12)',
                border: '1px solid rgba(40, 201, 154, 0.35)',
                color: '#059669',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                <CheckCircle2 size={18} />
                {executionResult.message}
              </div>
              <div style={{ fontSize: 12, color: '#047857' }}>
                The deal has been added to the sales board, contact associations are linked, and follow-up reminders
                are registered.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 10,
                    border: 'none',
                    background: '#10b981',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Done & View Pipeline
                </button>
              </div>
            </div>
          )}

          {/* Validation Error Banner */}
          {validationError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                background: 'rgba(244, 107, 114, 0.12)',
                border: '1px solid rgba(244, 107, 114, 0.3)',
                color: '#f46b72',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={15} />
              {validationError}
            </div>
          )}

          {/* Prompt Entry View */}
          {!parsed && executionResult?.status !== 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 6 }}>
                  Enter Natural Language Instruction
                </label>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g. Create a deal for ABC Enterprises worth ₹50,000, associate it with the existing contact if available, and help progress it through the sales pipeline..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid rgba(130, 145, 190, 0.28)',
                    background: 'white',
                    fontSize: 13,
                    color: 'var(--crm-text)',
                    boxSizing: 'border-box',
                    outline: 'none',
                    lineHeight: 1.5,
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Sample Prompts */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                  Quick Sample Prompts
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SAMPLE_PROMPTS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setPrompt(p);
                        void handleAnalyze(p);
                      }}
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(130, 145, 190, 0.18)',
                        background: 'rgba(255, 255, 255, 0.65)',
                        fontSize: 12,
                        color: 'var(--crm-text-secondary)',
                        cursor: 'pointer',
                        transition: 'background 120ms',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                        &ldquo;{p}&rdquo;
                      </span>
                      <ArrowRight size={12} color="var(--crm-primary)" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Rule & Safety Context Card */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(79, 109, 245, 0.05)',
                  border: '1px solid rgba(79, 109, 245, 0.15)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <ShieldCheck size={18} color="#4f6df5" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', lineHeight: 1.45 }}>
                  <strong>Safety First:</strong> Instructions are parsed into a validated preview. Automatic stage
                  progression follows explicit qualification criteria, and no deal is moved to Won/Lost without user
                  confirmation.
                </div>
              </div>
            </div>
          )}

          {/* Structured Preview & Edit View */}
          {parsed && executionResult?.status !== 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Duplicate Warning */}
              {duplicateWarning?.hasDuplicate && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: 'rgba(244, 201, 93, 0.15)',
                    border: '1px solid rgba(244, 201, 93, 0.4)',
                    color: '#d97706',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>{duplicateWarning.warningMessage}</span>
                </div>
              )}

              {/* Parsed Summary Box */}
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'rgba(130, 145, 190, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--crm-text-secondary)',
                }}
              >
                <Bot size={15} color="var(--crm-primary)" />
                <span style={{ flex: 1 }}>{parsed.summary}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: parsed.confidence === 'high' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 201, 93, 0.2)',
                    color: parsed.confidence === 'high' ? '#10b981' : '#d97706',
                  }}
                >
                  {parsed.confidence.toUpperCase()} CONFIDENCE
                </span>
              </div>

              {/* Form Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Deal Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(130, 145, 190, 0.25)',
                      fontSize: 13,
                      boxSizing: 'border-box',
                      color: 'var(--crm-text)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Deal Value *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <DollarSign size={13} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--crm-text-muted)' }} />
                    <input
                      type="number"
                      value={value}
                      onChange={e => setValue(e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        padding: '8px 12px 8px 28px',
                        borderRadius: 10,
                        border: '1px solid rgba(130, 145, 190, 0.25)',
                        fontSize: 13,
                        boxSizing: 'border-box',
                        color: 'var(--crm-text)',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(130, 145, 190, 0.25)',
                      fontSize: 13,
                      boxSizing: 'border-box',
                      background: 'white',
                      color: 'var(--crm-text)',
                    }}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Initial Sales Stage
                  </label>
                  <select
                    value={stageId}
                    onChange={e => setStageId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(130, 145, 190, 0.25)',
                      fontSize: 13,
                      boxSizing: 'border-box',
                      background: 'white',
                      color: 'var(--crm-text)',
                    }}
                  >
                    {stages.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Associated Contact
                  </label>
                  <select
                    value={contactId}
                    onChange={e => setContactId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(130, 145, 190, 0.25)',
                      fontSize: 13,
                      boxSizing: 'border-box',
                      background: 'white',
                      color: 'var(--crm-text)',
                    }}
                  >
                    <option value="">None (Unassigned)</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.company || c.phone || c.email || c.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Progression Rules Checklist */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.7)',
                  border: '1px solid rgba(130, 145, 190, 0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={14} color="var(--crm-primary)" />
                  Qualification & Progression Rules
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {parsed.qualificationRules.map((rule, idx) => (
                    <div key={idx} style={{ fontSize: 11, color: 'var(--crm-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={12} color="#10b981" />
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Follow-up Task Configuration */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(79, 109, 245, 0.04)',
                  border: '1px solid rgba(79, 109, 245, 0.16)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--crm-text)' }}>
                  <input
                    type="checkbox"
                    checked={enableFollowUp}
                    onChange={e => setEnableFollowUp(e.target.checked)}
                    style={{ accentColor: '#4f6df5', cursor: 'pointer' }}
                  />
                  <span>Schedule Automated Follow-up Reminder</span>
                </label>

                {enableFollowUp && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10, marginTop: 4 }}>
                    <input
                      type="text"
                      value={followUpTitle}
                      onChange={e => setFollowUpTitle(e.target.value)}
                      placeholder="Follow-up task title..."
                      style={{
                        padding: '7px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(130, 145, 190, 0.25)',
                        fontSize: 12,
                        color: 'var(--crm-text)',
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={13} color="var(--crm-text-muted)" />
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={followUpDays}
                        onChange={e => setFollowUpDays(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          width: '100%',
                          padding: '7px 8px',
                          borderRadius: 8,
                          border: '1px solid rgba(130, 145, 190, 0.25)',
                          fontSize: 12,
                          color: 'var(--crm-text)',
                        }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>days</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(130, 145, 190, 0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.75)',
          }}
        >
          {parsed ? (
            <button
              type="button"
              onClick={handleReset}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid rgba(130, 145, 190, 0.22)',
                background: 'white',
                fontSize: 12,
                color: 'var(--crm-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} /> Edit Instruction
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                border: '1px solid rgba(130, 145, 190, 0.22)',
                background: 'white',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--crm-text-secondary)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            {!parsed ? (
              <button
                type="button"
                disabled={analyzing}
                onClick={() => void handleAnalyze()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #4f6df5, #8b5cf6)',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: analyzing ? 0.7 : 1,
                  boxShadow: '0 4px 14px rgba(79, 109, 245, 0.28)',
                }}
              >
                <Sparkles size={14} />
                {analyzing ? 'Analyzing instruction...' : 'Interpret & Preview Deal'}
              </button>
            ) : (
              <button
                type="button"
                disabled={executing}
                onClick={() => void handleConfirm()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 22px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: executing ? 0.7 : 1,
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.28)',
                }}
              >
                <CheckCircle2 size={15} />
                {executing ? 'Executing Automation...' : 'Confirm & Create Deal'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
