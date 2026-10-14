"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

interface AttentionItem {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  count: number;
  sub: string;
  href: string;
  color: string;
  bg: string;
}

export function AttentionCards({ items }: { items: AttentionItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }}
        >
          <Link href={item.href}
            className="glass glass-hover flex flex-col gap-3 rounded-2xl p-4 transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: item.bg }}>
              <item.icon className="h-5 w-5" style={{ color: item.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-foreground)" }}>{item.count}</p>
              <p className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{item.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted-foreground)" }}>{item.sub}</p>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: item.color }}>
              View {item.label} <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
