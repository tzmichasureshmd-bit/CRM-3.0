"use client";

import { useEffect } from "react";

/**
 * Browser-level data protection for sensitive CRM screens.
 *
 * Adds oncontextmenu / copy / cut / dragstart suppression on the whole
 * window while the protected page is mounted, and adds a `crm-print-
 * protected` class to <body> so the print stylesheet hides the on-screen
 * data.
 *
 * IMPORTANT: This is a UI deterrent only, never a security boundary. The
 * real protection is server-side (auth, authorization, tenant isolation,
 * RLS, API authorization). It never touches inputs/textareas/selects, so
 * editing, searching and keyboard navigation stay fully functional — a
 * user can still type and interact, and can still select/copy within
 * editable fields.
 */
export function useDataProtection(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const suppress = (e: Event) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Ctrl/Cmd+C, Ctrl/Cmd+X, Ctrl/Cmd+P, Ctrl/Cmd+S
      if ((e.ctrlKey || e.metaKey) && ["c", "x", "p", "s"].includes(k)) {
        const target = e.target as HTMLElement | null;
        const inEditable =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable);
        // Never block copying from editable fields (user's own input).
        if (!inEditable) e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", suppress);
    document.addEventListener("copy", suppress);
    document.addEventListener("cut", suppress);
    document.addEventListener("dragstart", suppress);
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("crm-print-protected");

    return () => {
      document.removeEventListener("contextmenu", suppress);
      document.removeEventListener("copy", suppress);
      document.removeEventListener("cut", suppress);
      document.removeEventListener("dragstart", suppress);
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("crm-print-protected");
    };
  }, [enabled]);
}
