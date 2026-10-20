"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PasswordInputProps extends React.ComponentProps<"input"> {
  /**
   * Accessible labels for the visibility toggle. Defaults to English;
   * translated screens pass their own strings.
   */
  toggleLabels?: { show: string; hide: string };
}

/**
 * Password input with an inline show/hide toggle.
 *
 * - Renders as type="password" by default; the eye button flips it to
 *   type="text" and swaps to the "eye-off" glyph while visible.
 * - The toggle is a real <button> (focusable, Enter/Space native,
 *   aria-pressed + aria-label) positioned inside the field's right
 *   edge with reserved padding so it never overlaps typed text.
 */
function PasswordInput({ className, toggleLabels, ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative w-full">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={
          visible
            ? toggleLabels?.hide ?? "Hide password"
            : toggleLabels?.show ?? "Show password"
        }
        aria-pressed={visible}
        className="absolute inset-y-0 right-1.5 my-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export { PasswordInput };
