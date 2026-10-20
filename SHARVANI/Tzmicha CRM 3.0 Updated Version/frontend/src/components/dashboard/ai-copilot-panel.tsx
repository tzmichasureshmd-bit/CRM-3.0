"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, Send, ArrowRight } from "lucide-react";
import Link from "next/link";

const SUGGESTIONS = [
  "Show today's hot leads",
  "Which deals are at risk?",
  "Create a follow-up task",
  "Generate campaign ideas",
];

const TABS = ["Chat", "Actions", "Insights"] as const;
type Tab = typeof TABS[number];

export function AICopilotPanel() {
  const [tab, setTab] = useState<Tab>("Chat");
  const [input, setInput] = useState("");

  return (
    <div className="flex flex-col rounded-2xl h-full overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(79,110,247,0.06), rgba(139,92,246,0.06))", border: "1px solid rgba(79,110,247,0.15)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
          >
            <Brain className="h-4 w-4 text-white" />
          </motion.div>
          <span className="text-sm font-bold" style={{ color: "var(--color-foreground)" }}>AI Copilot</span>
        </div>
        <Link href="/copilot" className="text-[10px] font-semibold" style={{ color: "var(--brand-primary)" }}>
          Open full ···
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mx-4 mb-3 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.5)" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all"
            style={tab === t
              ? { background: "white", color: "var(--brand-primary)", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }
              : { color: "var(--color-muted-foreground)" }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pb-3">
        {tab === "Chat" && (
          <div className="space-y-3">
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.6)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Hello John,</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted-foreground)" }}>How can I help you today?</p>
            </div>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition-all hover:bg-white/60"
                  style={{ background: "rgba(255,255,255,0.4)", color: "var(--color-foreground)" }}>
                  <ArrowRight className="h-3 w-3 shrink-0" style={{ color: "var(--brand-primary)" }} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === "Actions" && (
          <div className="space-y-2">
            {["Assign hot leads", "Send follow-ups", "Update pipeline", "Generate report"].map((a) => (
              <button key={a} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all hover:bg-white/60"
                style={{ background: "rgba(255,255,255,0.4)", color: "var(--color-foreground)" }}>
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--brand-primary)" }} />
                {a}
              </button>
            ))}
          </div>
        )}
        {tab === "Insights" && (
          <div className="space-y-2">
            {["4 leads show high buying intent", "Pipeline grew 8% this week", "3 deals need follow-up", "Top channel: Instagram"].map((ins) => (
              <div key={ins} className="rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.4)", color: "var(--color-foreground)" }}>
                ✦ {ins}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ background: "rgba(255,255,255,0.7)", borderColor: "rgba(79,110,247,0.2)" }}>
          <input value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your CRM..."
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "var(--color-foreground)" }}
          />
          <button className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}>
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
