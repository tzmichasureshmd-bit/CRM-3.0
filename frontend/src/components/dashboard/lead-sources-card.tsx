"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const DATA = [
  { name: "Instagram", value: 32, color: "#E1306C" },
  { name: "WhatsApp", value: 28, color: "#25D366" },
  { name: "Facebook", value: 18, color: "#1877F2" },
  { name: "Website", value: 12, color: "#F59E0B" },
  { name: "Email", value: 10, color: "#EF4444" },
];

export function LeadSourcesCard() {
  return (
    <div className="glass rounded-2xl p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold" style={{ color: "var(--color-foreground)" }}>Lead Sources</h2>
        <button className="text-muted-foreground hover:text-foreground">···</button>
      </div>

      <div className="flex items-center justify-center mb-3">
        <div className="relative">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie data={DATA} cx={65} cy={65} innerRadius={42} outerRadius={62} paddingAngle={2} dataKey="value" strokeWidth={0}>
                {DATA.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v}%`, ""]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold" style={{ color: "var(--color-foreground)" }}>248</p>
            <p className="text-[10px]" style={{ color: "var(--color-muted-foreground)" }}>Total Leads</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {DATA.map((d) => (
          <div key={d.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="text-xs" style={{ color: "var(--color-foreground)" }}>{d.name}</span>
            </div>
            <span className="text-xs font-semibold" style={{ color: "var(--color-muted-foreground)" }}>{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
