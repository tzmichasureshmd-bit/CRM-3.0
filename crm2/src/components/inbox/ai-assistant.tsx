"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  Wand2,
  FileText,
  Target,
  Flame,
  ScanSearch,
  Lightbulb,
  Repeat,
  StickyNote,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface AiAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  /** Optional text to transform inline (rewrite / tone / translate). */
  sourceText?: string;
  onResult?: (text: string) => void;
}

type ActionId =
  | "summarize"
  | "detect_intent"
  | "detect_interest"
  | "extract_lead_info"
  | "next_action"
  | "generate_followup"
  | "create_note"
  | "rewrite"
  | "professional"
  | "friendly"
  | "translate";

const ACTIONS: { id: ActionId; icon: typeof Wand2; label: string; needsText: boolean }[] = [
  { id: "summarize", icon: FileText, label: "Summarize conversation", needsText: false },
  { id: "detect_intent", icon: Target, label: "Detect intent", needsText: false },
  { id: "detect_interest", icon: Flame, label: "Detect interest (1-5)", needsText: false },
  { id: "extract_lead_info", icon: ScanSearch, label: "Extract lead info", needsText: false },
  { id: "next_action", icon: Lightbulb, label: "Suggest next action", needsText: false },
  { id: "generate_followup", icon: Repeat, label: "Generate follow-up", needsText: false },
  { id: "create_note", icon: StickyNote, label: "Create CRM note", needsText: false },
  { id: "rewrite", icon: Wand2, label: "Rewrite (clearer)", needsText: true },
  { id: "professional", icon: Wand2, label: "Make professional", needsText: true },
  { id: "friendly", icon: Wand2, label: "Make friendly", needsText: true },
  { id: "translate", icon: Wand2, label: "Translate to English", needsText: true },
];

/**
 * AI Assistant — a drop-in dialog that runs the /api/ai/assistant
 * actions against the account's configured AI provider. Analysis
 * actions work from the conversation alone; composition actions that
 * need text use `sourceText` (e.g. the composer's current draft).
 * Results are displayed with a copy button and can be sent back to
 * the caller via `onResult`.
 */
export function AiAssistant({
  open,
  onOpenChange,
  conversationId,
  sourceText,
  onResult,
}: AiAssistantProps) {
  const t = useTranslations("Inbox.aiAssistant");
  const [busy, setBusy] = useState<ActionId | null>(null);
  const [result, setResult] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const run = async (id: ActionId) => {
    const needsText = ACTIONS.find((a) => a.id === id)?.needsText;
    if (needsText && !(sourceText && sourceText.trim())) {
      toast.error(t("aiAssistantNeedsText", { fallback: "Type a draft first (or select a message)." }));
      return;
    }
    setBusy(id);
    setResult("");
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: id,
          conversation_id: conversationId ?? undefined,
          text: needsText ? sourceText : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "AI request failed");
      }
      const text = typeof data.result === "string" ? data.result.trim() : "";
      if (!text) {
        toast.error(t("aiAssistantEmpty", { fallback: "AI returned nothing." }));
        return;
      }
      setResult(text);
      onResult?.(text);
    } catch (err) {
      console.error("[ai-assistant] failed:", err);
      toast.error(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("aiAssistantTitle", { fallback: "AI Assistant" })}
          </DialogTitle>
          <DialogDescription>
            {t("aiAssistantDesc", {
              fallback:
                "Analyse this conversation or compose a message with the account's AI provider.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                size="sm"
                variant="outline"
                onClick={() => run(action.id)}
                disabled={busy !== null || (!action.needsText && !conversationId)}
                title={
                  !action.needsText && !conversationId
                    ? t("aiAssistantNoConversation", { fallback: "Open a conversation to use this." })
                    : undefined
                }
                className="h-7 gap-1.5 border-border text-xs text-muted-foreground hover:text-foreground"
              >
                {busy === action.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {action.label}
              </Button>
            );
          })}
        </div>

        {result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("aiAssistantResult", { fallback: "Result" })}
              </span>
              <Button size="sm" variant="ghost" onClick={copy} className="h-7 gap-1 text-xs">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied
                  ? t("aiAssistantCopied", { fallback: "Copied" })
                  : t("aiAssistantCopy", { fallback: "Copy" })}
              </Button>
            </div>
            <Textarea
              readOnly
              value={result}
              className={cn("min-h-28 border-border bg-muted text-sm text-foreground")}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}