"use client";

import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const DATA = {
  "7D": [
    { date: "Mon", revenue: 180000, pipeline: 320000 },
    { date: "Tue", revenue: 210000, pipeline: 350000 },
    { date: "Wed", revenue: 195000, pipeline: 340000 },
    { date: "Thu", revenue: 240000, pipeline: 380000 },
    { date: "Fri", revenue: 260000, pipeline: 420000 },
    { date: "Sat", revenue: 220000, pipeline: 390000 },
    { date: "Sun", revenue: 280000, pipeline: 450000 },
  ],
  "1M": [
    { date: "Jan", revenue: 120000, pipeline: 200000 },
    { date: "Feb", revenue: 180000, pipeline: 280000 },
    { date: "Mar", revenue: 260000, pipeline: 350000 },
    { date: "Apr", revenue: 310000, pipeline: 420000 },
    { date: "May", revenue: 380000, pipeline: 500000 },
    { date: "Jun", revenue: 420000, pipeline: 560000 },
    { date: "Jul", revenue: 480000, pipeline: 620000 },
  ],
  "3M": [
    { date: "Jan", revenue: 120000, pipeline: 200000 },
    { date: "Feb", revenue: 180000, pipeline: 280000 },
    { date: "Mar", revenue: 260000, pipeline: 350000 },
    { date: "Apr", revenue: 310000, pipeline: 420000 },
    { date: "May", revenue: 380000, pipeline: 500000 },
    { date: "Jun", revenue: 420000, pipeline: 560000 },
    { date: "Jul", revenue: 480000, pipeline: 620000 },
  ],
  "1Y": [
    { date: "Q1", revenue: 560000, pipeline: 820000 },
    { date: "Q2", revenue: 780000, pipeline: 1100000 },
    { date: "Q3", revenue: 920000, pipeline: 1350000 },
    { date: "Q4", revenue: 1240000, pipeline: 1800000 },
  ],
};

type Range = "7D" | "1M" | "3M" | "1Y";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-4 py-3 text-sm shadow-xl">
      <p className="font-semibold mb-1" style={{ color: "var(--color-foreground)" }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: ₹{(p.value / 100000).toFixed(1)}L
        </p>
      ))}
    </div>
  );
};

export function RevenueChart() {
  const [range, setRange] = useState<Range>("3M");
  const data = DATA[range];

  return (
    <div className="glass rounded-2xl p-5 h-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-bold" style={{ color: "var(--color-foreground)" }}>Revenue Intelligence</h2>
        <div className="flex gap-1 rounded-xl p-1" style={{ background: "var(--color-muted)" }}>
          {(["7D", "1M", "3M", "1Y"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="rounded-lg px-3 py-1 text-xs font-semibold transition-all"
              style={range === r
                ? { background: "white", color: "var(--brand-primary)", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }
                : { color: "var(--color-muted-foreground)" }
              }
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4F6EF7" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#4F6EF7" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="pipGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v / 100000}L`} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#4F6EF7" strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: "#4F6EF7" }} />
          <Area type="monotone" dataKey="pipeline" name="Pipeline" stroke="#8B5CF6" strokeWidth={2} fill="url(#pipGrad)" dot={false} activeDot={{ r: 5, fill: "#8B5CF6" }} strokeDasharray="4 2" />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mt-3 flex items-center gap-4">
        {[{ color: "#4F6EF7", label: "Revenue" }, { color: "#8B5CF6", label: "Pipeline" }].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
            <span className="text-xs" style={{ color: "var(--color-muted-foreground)" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
