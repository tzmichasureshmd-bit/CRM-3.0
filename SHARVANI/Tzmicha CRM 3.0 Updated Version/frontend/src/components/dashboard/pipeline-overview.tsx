"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

const STAGES = [
  { name: "New", count: 12, value: "₹18,40,000", color: "#4F6EF7", deals: [
    { name: "Aster Labs", value: "₹80,000", prob: 90 },
    { name: "Nova Retail", value: "₹1,20,000", prob: 70 },
  ]},
  { name: "Contacted", count: 8, value: "₹12,60,000", color: "#06B6D4", deals: [
    { name: "BrightPath", value: "₹2,40,000", prob: 75 },
    { name: "Greenline", value: "₹90,000", prob: 60 },
  ]},
  { name: "Qualified", count: 5, value: "₹8,40,000", color: "#10B981", deals: [
    { name: "NorthPeak", value: "₹3,20,000", prob: 80 },
    { name: "Atlas Energy", value: "₹1,50,000", prob: 75 },
  ]},
  { name: "Proposal", count: 4, value: "₹6,20,000", color: "#F59E0B", deals: [
    { name: "Bloom Market", value: "₹2,80,000", prob: 85 },
    { name: "PulseWorks", value: "₹1,20,000", prob: 70 },
  ]},
];

export function PipelineOverview() {
  return (
    <div className="glass rounded-2xl p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold" style={{ color: "var(--color-foreground)" }}>Pipeline Overview</h2>
        <Link href="/pipelines" className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--brand-primary)" }}>
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {STAGES.map((stage) => (
          <div key={stage.name}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold" style={{ color: stage.color }}>{stage.name}</span>
              <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: stage.color }}>
                {stage.count}
              </span>
            </div>
            <p className="text-[10px] font-semibold mb-2" style={{ color: "var(--color-muted-foreground)" }}>{stage.value}</p>
            <div className="space-y-1.5">
              {stage.deals.map((deal) => (
                <div key={deal.name} className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid var(--color-border)" }}>
                  <p className="text-[10px] font-semibold truncate" style={{ color: "var(--color-foreground)" }}>{deal.name}</p>
                  <p className="text-[9px]" style={{ color: "var(--color-muted-foreground)" }}>{deal.value}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--color-muted)" }}>
                      <div className="h-full rounded-full" style={{ width: `${deal.prob}%`, background: stage.color }} />
                    </div>
                    <span className="text-[9px] font-bold" style={{ color: stage.color }}>{deal.prob}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
