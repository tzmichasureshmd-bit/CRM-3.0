"use client";

import { useEffect, useRef } from "react";
import { Sun, Moon, Monitor, Check, X } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { THEMES, type Mode } from "@/lib/themes";

interface ThemePanelProps {
  open: boolean;
  onClose: () => void;
}

const MODES: { id: Mode; label: string; icon: React.ReactNode }[] = [
  { id: "light", label: "Day", icon: <Sun className="h-4 w-4" /> },
  { id: "dark", label: "Night", icon: <Moon className="h-4 w-4" /> },
  { id: "auto", label: "Auto", icon: <Monitor className="h-4 w-4" /> },
];

export function ThemePanel({ open, onClose }: ThemePanelProps) {
  const { theme, setTheme, mode, setMode } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed right-4 top-14 z-[200] w-72 rounded-xl border border-border bg-popover shadow-2xl max-h-[calc(100vh-64px)] overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-foreground">Appearance</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Mode */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mode</p>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-medium transition-all ${
                  mode === m.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Themes */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Theme</p>
            <span className="text-xs text-muted-foreground capitalize">{theme}</span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.name}
                onClick={() => setTheme(t.id)}
                className="group relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all hover:scale-110"
                style={{
                  backgroundColor: t.swatch,
                  borderColor: theme === t.id ? t.swatch : "transparent",
                  boxShadow: theme === t.id ? `0 0 0 2px var(--background), 0 0 0 4px ${t.swatch}` : undefined,
                }}
              >
                {theme === t.id && (
                  <Check className="h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />
                )}
              </button>
            ))}
          </div>
          {/* Theme name label */}
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {THEMES.find((t) => t.id === theme)?.tagline}
          </p>
        </div>
      </div>
    </div>
  );
}
