'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  source?: string;
}

const SUGGESTIONS = [
  "Show today's hot leads",
  'Which deals are at risk?',
  'Show overdue follow-ups',
  'Pipeline summary',
];

export function AICopilot() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'Chat' | 'Actions' | 'Insights'>('Chat');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (query: string) => {
    if (!query.trim() || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: query }]);
    setLoading(true);
    try {
      const res = await fetch('/api/v3/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const d = await res.json() as { answer?: string; data_source?: string; error?: string };
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: d.answer ?? d.error ?? 'Something went wrong.',
        source: d.data_source,
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Could not reach the AI. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassPanel variant="ai" className="crm-copilot">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="crm-ai-orb" style={{ width: 36, height: 36 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text-strong)' }}>AI Copilot</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>Real CRM data</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(130,145,190,0.10)', borderRadius: 10, padding: 3 }}>
        {(['Chat', 'Actions', 'Insights'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: tab === t ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'none',
              color: tab === t ? 'white' : 'var(--crm-text-muted)',
              transition: 'all 150ms',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 200, minHeight: 80 }}>
        {messages.length === 0 ? (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>AI</div>
              <div style={{ background: 'rgba(255,255,255,0.65)', borderRadius: '0 12px 12px 12px', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.80)' }}>
                <div style={{ fontSize: 12.5, color: 'var(--crm-text-secondary)' }}>Ask me anything about your CRM data.</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  style={{ padding: '7px 9px', borderRadius: 10, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.75)', fontSize: 11, color: 'var(--crm-text-secondary)', cursor: 'pointer', textAlign: 'left', transition: 'all 150ms', fontWeight: 500 }}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'assistant' && (
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0, marginTop: 2 }}>AI</div>
              )}
              <div style={{
                maxWidth: '80%', padding: '8px 12px', borderRadius: m.role === 'user' ? '12px 0 12px 12px' : '0 12px 12px 12px',
                background: m.role === 'user' ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.65)',
                color: m.role === 'user' ? 'white' : 'var(--crm-text)',
                fontSize: 12, lineHeight: 1.5,
                border: m.role === 'assistant' ? '1px solid rgba(255,255,255,0.80)' : 'none',
                whiteSpace: 'pre-wrap',
              }}>
                {m.text}
                {m.source && <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4 }}>Source: {m.source}</div>}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Loader2 size={12} color="white" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>Analyzing CRM data...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 14, padding: '8px 10px 8px 14px', alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          placeholder="Ask anything about your CRM..."
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12.5, color: 'var(--crm-text-nav)' }}
        />
        <button
          onClick={() => void send(input)}
          disabled={loading || !input.trim()}
          className="crm-btn-primary"
          style={{ width: 32, height: 32, padding: 0, borderRadius: 10, flexShrink: 0, opacity: (loading || !input.trim()) ? 0.5 : 1 }}
          aria-label="Send"
        >
          <Send size={13} />
        </button>
      </div>
    </GlassPanel>
  );
}
