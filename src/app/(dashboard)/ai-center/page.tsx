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
  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    database: { label: 'CRM Data', icon: <Database className="h-3 w-3" />, cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' },
    ai_inference: { label: 'AI Analysis', icon: <Lightbulb className="h-3 w-3" />, cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400' },
    ai_recommendation: { label: 'AI Recommendation', icon: <Sparkles className="h-3 w-3" />, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  };
  const meta = map[source];
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
      {meta.icon} {meta.label}
    </span>
  );
}

function MessageBubble({ msg }: { msg: CopilotMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
        {isUser ? <User className="h-4 w-4" /> : <Brain className="h-4 w-4 text-primary" />}
      </div>
      <div className={`max-w-[80%] space-y-1 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-3 text-sm ${isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm'}`}>
          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        </div>
        {!isUser && (
          <div className="flex items-center gap-2 px-1">
            <DataSourceBadge source={msg.data_source} />
            <span className="text-[10px] text-muted-foreground">
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
      const res = await fetch('/api/v3/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!res.ok) throw new Error('Copilot unavailable');
      const data = await res.json();

      const assistantMsg: CopilotMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer,
        data_source: data.data_source,
        confidence: data.confidence,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'I encountered an error. The CRM continues working normally — please try again.',
          created_at: new Date().toISOString(),
        },
      ]);
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
    <div className="flex h-[calc(100dvh-var(--app-header-h)-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">AI Business Copilot</h1>
          <p className="text-xs text-muted-foreground">Powered by your real CRM data</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 dark:border-green-900/30 dark:bg-green-950/20">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-[11px] font-semibold text-green-700 dark:text-green-400">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Analyzing your CRM data...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested queries */}
      {messages.length <= 1 && (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => void send(q)}
                className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your CRM data..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-32"
            style={{ minHeight: '42px' }}
          />
          <button
            onClick={() => void send(input)}
            disabled={!input.trim() || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground px-1">
          <AlertCircle className="inline h-3 w-3 mr-0.5" />
          AI responses are based on your CRM data. Always verify before acting.
        </p>
      </div>
    </div>
  );
}
