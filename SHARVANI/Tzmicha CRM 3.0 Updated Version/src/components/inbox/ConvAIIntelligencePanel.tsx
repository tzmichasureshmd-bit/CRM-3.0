'use client';

import { useState, useCallback } from 'react';
import { Brain, Zap, Heart, Target, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';

interface AIIntelligence {
  summary: string;
  intent: string;
  sentiment: string;
  sentiment_explanation: string;
  lead_score: number;
  next_action: string;
  message_count: number;
  analyzed_at: string;
}

interface ConvAIIntelligencePanelProps {
  conversationId: string;
  contactName: string;
  platform: string;
  existingScore: number | null;
  existingIntent?: string | null;
  existingSentiment?: string | null;
  existingSummary?: string | null;
  existingNextAction?: string | null;
}

const SENTIMENT_META: Record<string, { color: string; emoji: string }> = {
  Positive: { color: '#28c99a', emoji: '😊' },
  Negative: { color: '#f46b72', emoji: '😟' },
  Neutral:  { color: '#8790aa', emoji: '😐' },
  Mixed:    { color: '#f4c95d', emoji: '🤔' },
  Unknown:  { color: '#8790aa', emoji: '❓' },
};

const INTENT_COLORS: Record<string, string> = {
  'High Buying Intent':  '#f46b72',
  'Pricing Inquiry':     '#f4c95d',
  'Product Inquiry':     '#4d7cff',
  'Appointment Request': '#28c99a',
  'Support Request':     '#8b5cf6',
  'Complaint':           '#f46b72',
  'Follow-up':           '#4f6df5',
  'Not Interested':      '#8790aa',
  'Information Request': '#4d7cff',
  'Unknown':             '#8790aa',
};

export function ConvAIIntelligencePanel({
  conversationId,
  contactName,
  platform,
  existingScore,
  existingIntent,
  existingSentiment,
  existingSummary,
  existingNextAction,
}: ConvAIIntelligencePanelProps) {
  const [intel, setIntel] = useState<AIIntelligence | null>(
    existingSummary ? {
      summary: existingSummary,
      intent: existingIntent ?? 'Unknown',
      sentiment: existingSentiment ?? 'Unknown',
      sentiment_explanation: '',
      lead_score: existingScore ?? 0,
      next_action: existingNextAction ?? 'Monitor and wait for next interaction',
      message_count: 0,
      analyzed_at: new Date().toISOString(),
    } : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v3/ai/summarize-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) throw new Error('Analysis failed');
      const data = await res.json();
      setIntel(data);
    } catch {
      setError('AI analysis temporarily unavailable. CRM data is unaffected.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const score = intel?.lead_score ?? existingScore ?? 0;
  const intent = intel?.intent ?? existingIntent ?? 'Unknown';
  const sentiment = intel?.sentiment ?? existingSentiment ?? 'Unknown';
  const sentMeta = SENTIMENT_META[sentiment] ?? SENTIMENT_META.Unknown;
  const intentColor = INTENT_COLORS[intent] ?? '#8790aa';
  const scoreColor = score >= 70 ? '#f46b72' : score >= 40 ? '#f4c95d' : '#8790aa';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="crm-ai-orb" style={{ width: 28, height: 28 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)' }}>AI Intelligence</span>
        </div>
        <button
          onClick={() => void analyze()}
          disabled={loading}
          title="Re-analyze conversation"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4, borderRadius: 6 }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)' }}>
          <AlertCircle size={12} color="#f46b72" />
          <span style={{ fontSize: 11, color: '#f46b72' }}>{error}</span>
        </div>
      )}

      {/* Lead Score */}
      <div style={{ background: 'rgba(255,255,255,0.50)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lead Score</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
            <svg width="48" height="48" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(130,145,190,0.15)" strokeWidth="4" />
              <circle cx="24" cy="24" r="20" fill="none" stroke={scoreColor} strokeWidth="4"
                strokeDasharray={`${(score / 100) * 125.6} 125.6`}
                strokeLinecap="round"
                transform="rotate(-90 24 24)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 750, color: scoreColor }}>{score}</div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor }}>
              {score >= 70 ? 'Hot Lead' : score >= 40 ? 'Warm Lead' : 'Cold Lead'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>
              {score >= 70 ? 'High buying intent' : score >= 40 ? 'Moderate interest' : 'Early stage'}
            </div>
          </div>
        </div>
        {score === 0 && !intel && (
          <button onClick={() => void analyze()} style={{ marginTop: 8, width: '100%', padding: '5px 0', borderRadius: 8, background: 'rgba(79,109,245,0.10)', border: '1px solid rgba(79,109,245,0.20)', color: '#4f6df5', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Analyzing...' : 'Analyze Now'}
          </button>
        )}
      </div>

      {/* Intent */}
      <div style={{ background: 'rgba(255,255,255,0.50)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intent</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={13} color={intentColor} />
          <span style={{ fontSize: 12, fontWeight: 700, color: intentColor }}>{intent}</span>
        </div>
      </div>

      {/* Sentiment */}
      <div style={{ background: 'rgba(255,255,255,0.50)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sentiment</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Heart size={13} color={sentMeta.color} />
          <span style={{ fontSize: 12, fontWeight: 700, color: sentMeta.color }}>{sentMeta.emoji} {sentiment}</span>
        </div>
        {intel?.sentiment_explanation && (
          <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 4 }}>{intel.sentiment_explanation}</div>
        )}
      </div>

      {/* Next Best Action */}
      <div style={{ background: 'linear-gradient(135deg,rgba(79,109,245,0.12),rgba(139,92,246,0.08))', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(79,109,245,0.20)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#4f6df5', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <Target size={10} style={{ display: 'inline', marginRight: 4 }} />Next Best Action
        </div>
        <div style={{ fontSize: 11, color: 'var(--crm-text)', lineHeight: 1.5 }}>
          {intel?.next_action ?? existingNextAction ?? (score >= 70 ? 'Contact immediately — high buying intent' : 'Send a personalized follow-up message')}
        </div>
        <button style={{ marginTop: 8, width: '100%', padding: '5px 0', borderRadius: 8, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          Take Action <ChevronRight size={9} />
        </button>
      </div>

      {/* AI Summary */}
      {(intel?.summary || existingSummary) && (
        <div style={{ background: 'rgba(255,255,255,0.50)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <Brain size={10} style={{ display: 'inline', marginRight: 4 }} />AI Summary
          </div>
          <div style={{ fontSize: 11, color: 'var(--crm-text-secondary)', lineHeight: 1.6 }}>
            {intel?.summary ?? existingSummary}
          </div>
        </div>
      )}

      {/* Contact info */}
      <div style={{ background: 'rgba(255,255,255,0.50)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contact</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700 }}>
            {(contactName ?? '?')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>{contactName}</div>
            <div style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>via {platform}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
