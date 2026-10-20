"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Send, Loader2, Database, Lightbulb, Sparkles, User, AlertCircle } from "lucide-react";
import type { CopilotMessage } from "@/types";

const SUGGESTIONS = [
  "Show today's hot leads",
  "Which deals are at risk?",
  "Show overdue follow-ups",
  "Which conversations need replies?",
  "Show revenue snapshot",
  "How is the team performing?",
  "Which campaign performed best?",
  "Show unanswered conversations",
];

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const map: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    database:          { label: "CRM Data",          color: "#1D4ED8", bg: "rgba(29,78,216,0.1)",  icon: <Database className="h-3 w-3" /> },
    ai_inference:      { label: "AI Analysis",       color: "#7C3AED", bg: "rgba(124,58,237,0.1)", icon: <Lightbulb className="h-3 w-3" /> },
    ai_recommendation: { label: "AI Recommendation", color: "#D97706", bg: "rgba(217,119,6,0.1)",  icon: <Sparkles className="h-3 w-3" /> },
  };
  const m = map[source];
  if (!m) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ color: m.color, background: m.bg }}>
      {m.icon} {m.label}
    </span>
  );
}

function Bubble({ msg }: { msg: CopilotMessage }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
      style={{ flexDirection: isUser ? "row-reverse" : "row" }}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: isUser ? "linear-gradient(135deg, #4F6EF7, #7C3AED)" : "var(--crm-muted)" }}>
        {isUser
          ? <User className="h-4 w-4 text-white" />
          : <Brain className="h-4 w-4" style={{ color: "var(--crm-brand)" }} />
        }
      </div>
      <div className="flex max-w-[80%] flex-col gap-1" style={{ alignItems: isUser ? "flex-end" : "flex-start" }}>
        <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
          style={isUser
            ? { background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", color: "#fff", borderTopRightRadius: 4 }
            : { background: "var(--crm-muted)", color: "var(--crm-foreground)", borderTopLeftRadius: 4 }
          }>
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
        {!isUser && (
          <div className="flex items-center gap-2 px-1">
            <SourceBadge source={msg.data_source} />
            <span className="text-[10px]" style={{ color: "var(--crm-muted-foreground)" }}>
              {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<CopilotMessage[]>([{
    id: "welcome",
    role: "assistant",
    content: "Hi! I'm your CRM AI Copilot 🤖\n\nI can answer questions about your leads, deals, conversations, campaigns, and team — using your real CRM data.\n\nWhat would you like to know?",
    data_source: "ai_recommendation",
    created_at: new Date().toISOString(),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = useCallback(async (query: string) => {
    if (!query.trim() || loading) return;
    const userMsg: CopilotMessage = { id: `u-${Date.now()}`, role: "user", content: query.trim(), created_at: new Date().toISOString() };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_AI_URL}/api/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), account_id: "", user_id: "" }),
      });
      const data = res.ok ? await res.json() : { answer: "I encountered an error. Please try again.", data_source: "database" };
      setMessages((p) => [...p, { id: `a-${Date.now()}`, role: "assistant", content: data.answer, data_source: data.data_source, created_at: new Date().toISOString() }]);
    } catch {
      setMessages((p) => [...p, { id: `e-${Date.now()}`, role: "assistant", content: "Connection error. The CRM continues working normally.", created_at: new Date().toISOString() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading]);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl"
      style={{
        height: "calc(100dvh - 4rem - 2.5rem)",
        background: "var(--crm-glass-bg)",
        border: "1px solid var(--crm-glass-border)",
        boxShadow: "var(--crm-glass-shadow)",
        backdropFilter: "blur(16px)",
      }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--crm-border)" }}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: "rgba(79,110,247,0.1)" }}>
          <Brain className="h-5 w-5" style={{ color: "var(--crm-brand)" }} />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold" style={{ color: "var(--crm-foreground)" }}>AI Business Copilot</h1>
          <p className="text-xs" style={{ color: "var(--crm-muted-foreground)" }}>Powered by real CRM data</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1"
          style={{ border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)" }}>
          <span className="h-1.5 w-1.5 rounded-full ai-pulse" style={{ background: "#10B981" }} />
          <span className="text-[11px] font-semibold" style={{ color: "#10B981" }}>Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((msg) => <Bubble key={msg.id} msg={msg} />)}
        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--crm-muted)" }}>
              <Brain className="h-4 w-4" style={{ color: "var(--crm-brand)" }} />
            </div>
            <div className="flex items-center gap-2 rounded-2xl px-4 py-3"
              style={{ background: "var(--crm-muted)", borderTopLeftRadius: 4 }}>
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--crm-muted-foreground)" }} />
              <span className="text-sm" style={{ color: "var(--crm-muted-foreground)" }}>Analyzing CRM data...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="px-5 py-3" style={{ borderTop: "1px solid var(--crm-border)" }}>
          <p className="mb-2 text-xs font-medium" style={{ color: "var(--crm-muted-foreground)" }}>Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((q) => (
              <button key={q} onClick={() => void send(q)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  border: "1px solid var(--crm-border)",
                  background: "var(--crm-muted)",
                  color: "var(--crm-foreground)",
                }}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3" style={{ borderTop: "1px solid var(--crm-border)" }}>
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            placeholder="Ask anything about your CRM data..."
            rows={1}
            className="flex-1 resize-none rounded-xl px-4 py-2.5 text-sm"
            style={{
              border: "1px solid var(--crm-border)",
              background: "var(--crm-glass-bg)",
              color: "var(--crm-foreground)",
              maxHeight: "8rem",
            }}
          />
          <button onClick={() => void send(input)} disabled={!input.trim() || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-all"
            style={{
              background: "linear-gradient(135deg, #4F6EF7, #7C3AED)",
              opacity: (!input.trim() || loading) ? 0.4 : 1,
            }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 flex items-center gap-1 px-1 text-[10px]" style={{ color: "var(--crm-muted-foreground)" }}>
          <AlertCircle className="h-3 w-3" />
          AI responses are based on your CRM data. Always verify before acting.
        </p>
      </div>
    </div>
  );
}
