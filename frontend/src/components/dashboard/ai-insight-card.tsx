"use client";

import { motion } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";

const reasons = [
  "Requested pricing",
  "Visited landing page",
  "Replied multiple times",
  "Engaged with campaign",
];

export function AIInsightCard() {
  return (
    <div className="glass rounded-2xl p-5 h-full flex flex-col" style={{ background: "linear-gradient(135deg, rgba(79,110,247,0.06), rgba(139,92,246,0.06))", border: "1px solid rgba(79,110,247,0.15)" }}>
      <div className="flex items-center gap-3 mb-4">
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "linear-gradient(135deg, #4F6EF7, #8B5CF6)" }}
        >
          <span className="text-lg">🔮</span>
        </motion.div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--brand-primary)" }}>AI Insight</p>
          <p className="text-sm font-bold" style={{ color: "var(--color-foreground)" }}>4 leads show high buying intent.</p>
        </div>
      </div>

      <div className="flex-1 space-y-2 mb-4">
        {reasons.map((r) => (
          <div key={r} className="flex items-center gap-2">
            <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(16,185,129,0.15)" }}>
              <Check className="h-2.5 w-2.5" style={{ color: "#10B981" }} />
            </div>
            <span className="text-xs" style={{ color: "var(--color-foreground)" }}>{r}</span>
          </div>
        ))}
      </div>

      <Link href="/leads"
        className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
        style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
      >
        View Leads <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
