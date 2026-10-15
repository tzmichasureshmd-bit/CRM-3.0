"use client";

import { useDataProtection } from "@/hooks/use-data-protection";

/**
 * Renders a fixed "Confidential" watermark plus the current user/tenant
 * identifier over a protected CRM screen, and activates the browser-level
 * data-protection (context-menu / copy / print suppression) for the page.
 *
 * The watermark is a visual deterrent only; it in no way prevents OS-level
 * screenshot or external screen-recording software.
 */
export function ConfidentialWatermark({
  identifier,
  label = "Confidential • CRM",
  enabled = true,
}: {
  identifier?: string | null;
  label?: string;
  enabled?: boolean;
}) {
  useDataProtection(enabled);

  if (!enabled) return null;

  return (
    <div className="crm-watermark" aria-hidden="true">
      <span>
        {label}
        {identifier ? ` • ${identifier}` : ""}
      </span>
    </div>
  );
}
