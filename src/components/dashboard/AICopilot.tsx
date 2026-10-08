'use client';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';

const suggestions = [
  "Show today's hot leads",
  'Which deals are at risk?',
  'Create a follow-up task',
  'Generate campaign ideas',
];

export function AICopilot() {
  const [input, setInput] = useState('');
  const [tab, setTab] = useState<'Chat' | 'Actions' | 'Insights'>('Chat');

  return (
    <GlassPanel variant="ai" className="crm-copilot">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="crm-ai-orb" style={{ width: 36, height: 36 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>AI Copilot</span>
        </div>
        <button style={{ background: 'none', border: 'none', color: 'var(--crm-text-muted)', fontSize: 18, cursor: 'pointer' }}>···</button>
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

      {/* Message */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>J</div>
          <div style={{ background: 'rgba(255,255,255,0.55)', borderRadius: '0 12px 12px 12px', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.70)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)', marginBottom: 2 }}>Hello John,</div>
            <div style={{ fontSize: 12.5, color: 'var(--crm-text-secondary)' }}>How can I help you today?</div>
          </div>
        </div>

        {/* Suggestions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {suggestions.map(s => (
            <button
              key={s}
              onClick={() => setInput(s)}
              style={{ padding: '7px 9px', borderRadius: 10, background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.68)', fontSize: 11, color: 'var(--crm-text-secondary)', cursor: 'pointer', textAlign: 'left', transition: 'all 150ms', fontWeight: 500 }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: 14, padding: '8px 10px 8px 14px', alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask anything about your CRM..."
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12.5, color: 'var(--crm-text)' }}
        />
        <button
          className="crm-btn-primary"
          style={{ width: 32, height: 32, padding: 0, borderRadius: 10, flexShrink: 0 }}
          aria-label="Send"
        >
          <Send size={13} />
        </button>
      </div>
    </GlassPanel>
  );
}
