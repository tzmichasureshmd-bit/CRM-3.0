'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, Send, Loader2, Database, Lightbulb, AlertCircle, User, Sparkles } from 'lucide-react';
import type { CopilotMessage } from '@/types/crm3';

const SUGGESTED_QUERIES = [
  "Show today's hot leads",
  "Which customers need follow-up?",
  "Which deals are at risk?",
  "Show unanswered conversations",
  "Which campaign performed best?",
  "Summarize this week's pipeline",
  "Which leads should I contact first?",
  "Show overdue follow-ups",
];

function DataSourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const map: Record<string, { label: string; icon: React.ReactNode; bg: string; color: string }> = {
    database:          { label: 'CRM Data',          icon: <Database size={10} />,  bg: '#dbeafe', color: '#1d4ed8' },
    ai_inference:      { label: 'AI Analysis',        icon: <Lightbulb size={10} />, bg: '#ede9fe', color: '#6d28d9' },
    ai_recommendation: { label: 'AI Recommendation',  icon: <Sparkles size={10} />,  bg: '#fef3c7', color: '#92400e' },
  };
  const meta = map[source];
  if (!meta) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, background: meta.bg, color: meta.color }}>
      {meta.icon} {meta.label}
    </span>
  );
}

function MessageBubble({ msg }: { msg: CopilotMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isUser ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(79,109,245,0.10)' }}>
        {isUser ? <User size={15} color="white" /> : <Brain size={15} color="#4f6df5" />}
      </div>
      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <div style={{
          padding: '10px 14px', borderRadius: isUser ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
          fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
          background: isUser ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.92)',
          color: isUser ? 'white' : '#101936',
          boxShadow: isUser ? '0 4px 14px rgba(79,109,245,0.25)' : '0 2px 8px rgba(64,72,120,0.08)',
          border: isUser ? 'none' : '1px solid rgba(130,145,190,0.18)',
        }}>
          {msg.content}
        </div>
        {!isUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
            <DataSourceBadge source={msg.data_source} />
            <span style={{ fontSize: 10, color: '#8790aa' }}>
              {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I'm your CRM AI Copilot. I can answer questions about your leads, deals, conversations, campaigns, and team — using your real CRM data.\n\nWhat would you like to know?",
      data_source: 'ai_recommendation',
      created_at: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (query: string) => {
    if (!query.trim() || loading) return;

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
      const token = typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : '';
      const res = await fetch(`${BACKEND}/api/v1/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!res.ok) throw new Error('Copilot unavailable');
      const data = await res.json();

      setMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer,
        data_source: data.data_source,
        confidence: data.confidence,
        created_at: new Date().toISOString(),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'I encountered an error. The CRM continues working normally — please try again.',
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 64px - 52px)', borderRadius: 20, overflow: 'hidden', background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(130,145,190,0.18)', boxShadow: '0 8px 32px rgba(64,72,120,0.10)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid rgba(130,145,190,0.14)', background: 'rgba(255,255,255,0.98)', flexShrink: 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(79,109,245,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Brain size={20} color="#4f6df5" />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#101936' }}>AI Business Copilot</div>
          <div style={{ fontSize: 11, color: '#8790aa' }}>Powered by your real CRM data</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 20, border: '1px solid rgba(40,201,154,0.30)', background: 'rgba(40,201,154,0.08)', padding: '4px 10px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#28c99a', display: 'block' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#28c99a' }}>Online</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, background: '#f8f9ff' }}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(79,109,245,0.10)' }}>
              <Brain size={15} color="#4f6df5" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: '4px 18px 18px 18px', background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(130,145,190,0.18)', boxShadow: '0 2px 8px rgba(64,72,120,0.08)' }}>
              <Loader2 size={14} color="#8790aa" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, color: '#8790aa' }}>Analyzing your CRM data...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested queries */}
      {messages.length <= 1 && (
        <div style={{ borderTop: '1px solid rgba(130,145,190,0.14)', padding: '12px 20px', background: 'rgba(255,255,255,0.98)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8790aa', marginBottom: 8 }}>Try asking:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUGGESTED_QUERIES.map((q) => (
              <button key={q} onClick={() => void send(q)}
                style={{ borderRadius: 20, border: '1px solid rgba(130,145,190,0.22)', background: 'rgba(255,255,255,0.80)', padding: '5px 12px', fontSize: 12, fontWeight: 500, color: '#334E68', cursor: 'pointer', transition: 'background 150ms' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,109,245,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.80)')}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ borderTop: '1px solid rgba(130,145,190,0.14)', padding: '12px 16px', background: 'rgba(255,255,255,0.98)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your CRM data..."
            rows={1}
            style={{ flex: 1, resize: 'none', borderRadius: 14, border: '1px solid rgba(130,145,190,0.25)', background: '#f8f9ff', padding: '10px 14px', fontSize: 13, color: '#101936', outline: 'none', minHeight: 42, maxHeight: 128, fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          <button onClick={() => void send(input)} disabled={!input.trim() || loading}
            style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer', opacity: (!input.trim() || loading) ? 0.45 : 1, transition: 'opacity 150ms' }}>
            {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: '#8790aa', display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 4 }}>
          <AlertCircle size={10} />
          AI responses are based on your CRM data. Always verify before acting.
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
