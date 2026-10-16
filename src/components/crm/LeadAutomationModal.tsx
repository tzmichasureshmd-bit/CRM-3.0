'use client';

import { useState } from 'react';
import {
  Sparkles,
  Bot,
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Zap,
} from 'lucide-react';
import type { ContactRecord } from '@/lib/crm-pipeline-store';
import {
  parseNaturalLanguageLead,
  checkDuplicateLead,
  type ParsedLeadIntent,
  type DuplicateLeadCheckResult,
} from '@/lib/lead-automation-engine';

interface LeadAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingContacts: ContactRecord[];
  onConfirmCreate: (params: {
    name: string;
    phone: string | null;
    email: string | null;
    company: string | null;
    stageId: string;
    tier: 'hot' | 'warm' | 'cold';
    score: number;
    tags: string[];
    rationale: string;
    originalPrompt: string;
  }) => Promise<{ success: boolean; contactId?: string; error?: string }>;
}

const SAMPLE_LEAD_PROMPTS = [
  'Add an enterprise lead: Rajesh Sharma from Tata Motors, phone +91 98765 43210, email rajesh@tatamotors.com, interested in WhatsApp CRM API, mark as hot priority',
  'New inbound contact: Priya Patel, phone +91 91234 56789, company Reliance Retail, qualified lead, tag as retail, enterprise',
  'Contacted lead: Alex Chen from FinTech Labs, email alex@fintechlabs.io, warm priority, tag as fintech',
];

export function LeadAutomationModal({
  isOpen,
  onClose,
  existingContacts,
  onConfirmCreate,
}: LeadAutomationModalProps) {
  const [prompt, setPrompt] = useState(
    'Add an enterprise lead: Rajesh Sharma from Tata Motors, phone +91 98765 43210, email rajesh@tatamotors.com, interested in WhatsApp CRM API, mark as hot priority'
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [parsed, setParsed] = useState<ParsedLeadIntent | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateLeadCheckResult | null>(null);

  // Editable preview fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [stageId, setStageId] = useState('new');
  const [tier, setTier] = useState<'hot' | 'warm' | 'cold'>('warm');
  const [tags, setTags] = useState('');
  const [rationale, setRationale] = useState('');

  // Execution state
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    status: 'success' | 'error';
    message: string;
    contactId?: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAnalyze = async (textToAnalyze?: string) => {
    const rawText = (textToAnalyze ?? prompt).trim();
    if (!rawText) {
      setValidationError('Please enter a natural language lead instruction.');
      return;
    }

    setAnalyzing(true);
    setValidationError(null);
    setExecutionResult(null);

    try {
      const res = await fetch('/api/v3/ai/lead-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawText,
          existingContacts,
        }),
      });

      let parsedResult: ParsedLeadIntent;
      if (res.ok) {
        const data = await res.json();
        parsedResult = data.parsed as ParsedLeadIntent;
      } else {
        parsedResult = parseNaturalLanguageLead(rawText, existingContacts);
      }

      setParsed(parsedResult);
      setName(parsedResult.name);
      setPhone(parsedResult.phone || '');
      setEmail(parsedResult.email || '');
      setCompany(parsedResult.company || '');
      setStageId(parsedResult.stageId);
      setTier(parsedResult.tier);
      setTags(parsedResult.tags.join(', '));
      setRationale(parsedResult.rationale);

      const dup = checkDuplicateLead(
        parsedResult.name,
        parsedResult.phone,
        parsedResult.email,
        existingContacts
      );
      setDuplicateWarning(dup);
    } catch {
      const parsedResult = parseNaturalLanguageLead(rawText, existingContacts);
      setParsed(parsedResult);
      setName(parsedResult.name);
      setPhone(parsedResult.phone || '');
      setEmail(parsedResult.email || '');
      setCompany(parsedResult.company || '');
      setStageId(parsedResult.stageId);
      setTier(parsedResult.tier);
      setTags(parsedResult.tags.join(', '));
      setRationale(parsedResult.rationale);

      const dup = checkDuplicateLead(
        parsedResult.name,
        parsedResult.phone,
        parsedResult.email,
        existingContacts
      );
      setDuplicateWarning(dup);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirm = async () => {
    setValidationError(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    const trimmedCompany = company.trim();

    if (!trimmedName && !trimmedPhone && !trimmedEmail) {
      setValidationError('Please provide at least a full name, phone number, or email address.');
      return;
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setValidationError('Please enter a valid email address.');
      return;
    }

    const parsedTags = tags
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    const score = tier === 'hot' ? 85 : tier === 'warm' ? 60 : 25;
    const displayLabel = trimmedName || trimmedCompany || trimmedPhone || trimmedEmail || 'Lead';

    setExecuting(true);
    try {
      const res = await onConfirmCreate({
        name: trimmedName,
        phone: trimmedPhone || null,
        email: trimmedEmail || null,
        company: trimmedCompany || null,
        stageId,
        tier,
        score,
        tags: parsedTags,
        rationale: rationale.trim() || 'Created via lead automation',
        originalPrompt: prompt,
      });

      if (res.success) {
        setExecutionResult({
          status: 'success',
          message: `Lead "${displayLabel}" successfully created and prioritized!`,
          contactId: res.contactId,
        });
      } else {
        setExecutionResult({
          status: 'error',
          message: res.error || 'Failed to create lead.',
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
                Lead Automation Assistant
              </h2>
              <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 2 }}>
                Parse natural language inquiries into prioritized CRM leads and qualification tags
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
          {/* Success Banner */}
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
                The contact has been registered on the CRM lead board with appropriate priority tier and tags.
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
                  Done & View CRM Board
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
                  Enter Natural Language Lead Instruction
                </label>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g. Add an enterprise lead: Rajesh Sharma from Tata Motors, phone +91 98765 43210, email rajesh@tatamotors.com, mark as hot priority..."
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
                  {SAMPLE_LEAD_PROMPTS.map((p, idx) => (
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
                  <strong>Intelligent Prioritization:</strong> Extracted leads are scored based on buying intent and
                  reachability. Duplicate contacts are flagged automatically before insertion.
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
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
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
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={e => setCompany(e.target.value)}
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
                    Phone (WhatsApp)
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
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
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
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
                    CRM Stage
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
                    <option value="new">New Leads</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="proposal">Proposal</option>
                    <option value="negotiation">Negotiation</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Priority / Tier
                  </label>
                  <select
                    value={tier}
                    onChange={e => setTier(e.target.value as 'hot' | 'warm' | 'cold')}
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
                    <option value="hot">🔥 Hot (85 pts)</option>
                    <option value="warm">⚡ Warm (60 pts)</option>
                    <option value="cold">❄️ Cold (25 pts)</option>
                  </select>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                    placeholder="enterprise, inbound, urgent"
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

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
                    Lead Scoring Rationale
                  </label>
                  <input
                    type="text"
                    value={rationale}
                    onChange={e => setRationale(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(130, 145, 190, 0.25)',
                      fontSize: 12,
                      boxSizing: 'border-box',
                      color: 'var(--crm-text-secondary)',
                    }}
                  />
                </div>
              </div>

              {/* Recommended Next Action */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(79, 109, 245, 0.05)',
                  border: '1px solid rgba(79, 109, 245, 0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Zap size={16} color="var(--crm-primary)" />
                <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)' }}>
                  <strong>Recommended Next Action:</strong> {parsed.suggestedAction}
                </div>
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
                {analyzing ? 'Analyzing instruction...' : 'Interpret & Preview Lead'}
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
                {executing ? 'Executing Automation...' : 'Confirm & Add Lead'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
