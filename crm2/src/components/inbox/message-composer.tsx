"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
} from "react";
import {
  Send,
  LayoutTemplate,
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  Mic,
  Square,
  X,
  Loader2,
  Sparkles,
  Plus,
  MessageSquareDashed,
  Zap,
  SmilePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCan } from "@/hooks/use-can";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  uploadAccountMedia,
  deleteAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from "@/lib/storage/upload-media";
import { ReplyQuote } from "./reply-quote";
import { useTranslations } from "next-intl";
import {
  InteractiveBuilder,
  blankButtonsPayload,
} from "@/components/interactive/interactive-builder";
import { validateInteractivePayload } from "@/lib/whatsapp/interactive";
import type { ConversationPlatform, InteractiveMessagePayload, QuickReply } from "@/types";
import { QuickReplyPicker } from "./quick-reply-picker";

/** Media content types an agent can send from the composer. */
export type ComposerMediaKind = "image" | "video" | "document" | "audio";

/** Supabase Storage bucket holding agent-sent chat attachments (migration 023). */
export const CHAT_MEDIA_BUCKET = "chat-media";

/** Meta caps media captions at 1024 chars. Enforced here and in the send route. */
export const MEDIA_CAPTION_MAX = 1024;

/** Hard cap on a single voice recording so it can't blow the upload/
 *  transcode limits — auto-stops the recorder when reached. */
const MAX_RECORDING_SECONDS = 5 * 60;

export interface SendMediaPayload {
  kind: ComposerMediaKind;
  /** Public chat-media URL Meta fetches at send time. */
  mediaUrl: string;
  /** Storage object path — lets the caller GC the object if the send fails. */
  path: string;
  /** Optional caption (image/video/document only). */
  caption?: string;
  /** Original file name — surfaced to the recipient for documents. */
  filename?: string;
  replyToId?: string;
}

interface ReplyDraft {
  /** Internal UUID of the message being replied to — sent back through onSend. */
  id: string;
  authorLabel: string;
  preview: string;
}

// Mirrors the chat-media bucket's allowed_mime_types (migration 023) for
// the file picker so unsupported files are rejected before upload rather
// than failing with a confusing Storage error. Audio has no picker — it's
// captured via the recorder.
const PICKER_ACCEPT: Record<"image" | "video" | "document", string> = {
  image: "image/png,image/jpeg,image/webp",
  video: "video/mp4,video/3gpp",
  document:
    "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain",
};

interface MediaDraft {
  kind: ComposerMediaKind;
  mediaUrl: string;
  /** Storage path — used to GC the object if the draft is discarded. */
  path: string;
  filename: string;
  caption: string;
}

/**
 * The row of square icon controls beside the textarea: attach, `+`,
 * templates, AI draft, emoji.
 *
 * They were `text-muted-foreground` with a `hover:text-foreground` and
 * nothing else. Read at rest against the bar they are legible, but
 * there was no affordance and no focus state at all — nothing to tell a
 * keyboard user which control they were on, and nothing to make them
 * read as buttons rather than stray glyphs.
 *
 * The border is transparent at rest and only appears on hover/focus, so
 * the resting row is unchanged; the `disabled:` tail is required because
 * otherwise a disabled control keeps the hover surface it can no longer
 * act on.
 */
const ROW_ICON_BUTTON = cn(
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent p-0",
  "text-muted-foreground transition-colors",
  "hover:border-border hover:bg-card hover:text-foreground",
  "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "disabled:border-transparent disabled:bg-transparent disabled:hover:border-transparent disabled:hover:bg-transparent",
);

interface MessageComposerProps {
  conversationId: string;
  /** The conversation's channel. WhatsApp keeps its 24h-window rules,
   *  templates and interactive messages; Messenger/Instagram only get the
   *  free-form media + text path the send route supports for them. */
  platform: ConversationPlatform;
  sessionExpired: boolean;
  onSend: (text: string, replyToId?: string) => void;
  onSendMedia: (payload: SendMediaPayload) => void;
  onSendInteractive: (payload: InteractiveMessagePayload, replyToId?: string) => void;
  onOpenTemplates: () => void;
  replyTo?: ReplyDraft | null;
  onClearReply?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Worker that encodes mic input to Ogg/Opus entirely in the browser
 *  (vendored from opus-recorder into /public). Recording client-side in a
 *  Meta-accepted format means no server ffmpeg / transcode step. */
const OPUS_ENCODER_PATH = "/opus/encoderWorker.min.js";

export function MessageComposer({
  conversationId,
  platform,
  sessionExpired,
  onSend,
  onSendMedia,
  onSendInteractive,
  onOpenTemplates,
  replyTo,
  onClearReply,
}: MessageComposerProps) {
  const t = useTranslations("Inbox.composer");

  // WhatsApp-only affordances: interactive messages, quick replies and
  // templates (the send route rejects them for Messenger/Instagram).
  // Instagram additionally rejects documents and audio — those pickers
  // are hidden so files aren't uploaded and orphaned in the bucket.
  const isWhatsApp = platform === "whatsapp";
  const isInstagram = platform === "instagram";
  const isTelegram = platform === "telegram";
  const isX = platform === "x";
  const isThreads = platform === "threads";
  // X and Threads: text only (no templates, no interactive, no audio/document)
  const isTextOnly = isX || isThreads;
  // Telegram supports text + media but not WhatsApp templates or interactive messages
  const supportsTemplates = isWhatsApp;
  const supportsInteractive = isWhatsApp;
  // X Free tier: text only. Threads: text only via API.
  const supportsMedia = !isTextOnly;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Curated emoji set for the composer — same six as message-actions
  // (WhatsApp's quick-reaction bar) plus a few conversation staples.
  // Deliberately small to avoid pulling a 300KB emoji library.
  const COMPOSER_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "👀", "✅", "🎉", "💡"];

  // WhatsApp Business API text message limit.
  const TEXT_CHAR_LIMIT = 4096;

  const insertEmoji = useCallback(
    (emoji: string) => {
      const el = textareaRef.current;
      if (!el) {
        setText((prev) => prev + emoji);
        return;
      }
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const next = text.slice(0, start) + emoji + text.slice(end);
      setText(next);
      setEmojiPickerOpen(false);
      const newPos = start + emoji.length;
      requestAnimationFrame(() => {
        el.setSelectionRange(newPos, newPos);
        el.focus();
      });
    },
    [text],
  );

  // Interactive-message builder dialog + quick-reply picker.
  const [interactiveOpen, setInteractiveOpen] = useState(false);
  const [interactivePayload, setInteractivePayload] =
    useState<InteractiveMessagePayload>(blankButtonsPayload);
  const [savingQuickReply, setSavingQuickReply] = useState(false);
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);

  // Media attachment state. `draft` holds an uploaded-but-not-yet-sent
  // attachment; `busy` covers the upload/transcode window.
  const [draft, setDraft] = useState<MediaDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  // Mirror of `draft` for the unmount cleanup, which can't read render
  // state. Kept in sync below so navigating away with a staged-but-unsent
  // attachment GCs the orphaned object.
  const draftRef = useRef<MediaDraft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Best-effort GC of a staged object the user never sent. Fire-and-forget.
  const removeStaged = useCallback((path: string | undefined) => {
    if (!path) return;
    void deleteAccountMedia(CHAT_MEDIA_BUCKET, path).catch(() => {});
  }, []);

  // Voice recording state. The recorder encodes Ogg/Opus in-browser
  // (opus-recorder) so there's no server-side transcode.
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<import("opus-recorder").default | null>(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Viewers (read-only role) can browse the inbox but never send.
  // For solo users this is always true — single-owner accounts pass
  // every capability — so the disabled branch is a no-op there.
  const canSend = useCan("send-messages");
  const readOnly = !canSend;
  // Media (like free-form text) is only allowed inside the 24h window.
  const inputsDisabled = readOnly || sessionExpired;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Tear down any live recording + timer on unmount so a mid-record
  // navigation doesn't leak the mic, and GC a staged-but-unsent
  // attachment so it doesn't orphan in the bucket.
  useEffect(() => {
    return () => {
      clearTimer();
      cancelledRef.current = true;
      // stop() releases the mic stream + audio context inside opus-recorder.
      void recorderRef.current?.stop().catch(() => {});
      removeStaged(draftRef.current?.path);
    };
  }, [clearTimer, removeStaged]);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Max 4 lines (~96px)
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || sessionExpired) return;

    setSending(true);
    try {
      onSend(trimmed, replyTo?.id);
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  }, [text, sending, sessionExpired, onSend, replyTo?.id]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      adjustHeight();
    },
    [adjustHeight]
  );

  // Ask the AI assistant for a suggested reply and drop it into the
  // composer for the agent to edit + send. Read-only server-side —
  // nothing is sent until the agent hits Send.
  const handleDraft = useCallback(async () => {
    if (drafting) return;
    setDrafting(true);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "ai_not_configured") {
          toast.error("AI isn't set up yet — enable it in Settings → AI Assistant.");
        } else {
          toast.error(data.error ?? "Couldn't draft a reply.");
        }
        return;
      }
      const draftText = typeof data.draft === "string" ? data.draft.trim() : "";
      if (!draftText) {
        toast.error("The assistant didn't return a reply.");
        return;
      }
      setText(draftText);
      // Let the textarea grow to fit and drop the cursor at the end so
      // the agent can tweak immediately.
      requestAnimationFrame(() => {
        adjustHeight();
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    } catch {
      toast.error("Couldn't reach the AI assistant.");
    } finally {
      setDrafting(false);
    }
  }, [drafting, conversationId, adjustHeight]);

  // ---- Interactive message + quick replies --------------------------

  const openInteractiveBuilder = useCallback(
    (seed?: InteractiveMessagePayload) => {
      setInteractivePayload(seed ?? blankButtonsPayload());
      setInteractiveOpen(true);
    },
    [],
  );

  const sendInteractive = useCallback(() => {
    const result = validateInteractivePayload(interactivePayload);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onSendInteractive(interactivePayload, replyTo?.id);
    setInteractiveOpen(false);
    onClearReply?.();
  }, [interactivePayload, onSendInteractive, replyTo?.id, onClearReply]);

  // Persist the current builder payload as a reusable interactive snippet.
  const saveAsQuickReply = useCallback(async () => {
    const result = validateInteractivePayload(interactivePayload);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const title = window
      .prompt(t("quickReplyNamePrompt"))
      ?.trim();
    if (!title) return;
    setSavingQuickReply(true);
    try {
      const res = await fetch("/api/quick-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          kind: "interactive",
          interactive_payload: interactivePayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("quickReplySaveError"));
        return;
      }
      toast.success(t("quickReplySaved"));
    } catch {
      toast.error(t("quickReplySaveError"));
    } finally {
      setSavingQuickReply(false);
    }
  }, [interactivePayload, t]);

  // A picked quick reply: text fills the composer; interactive opens the
  // builder pre-filled so the agent can tweak before sending.
  const handlePickQuickReply = useCallback(
    (qr: QuickReply) => {
      setQuickReplyOpen(false);
      if (qr.kind === "interactive" && qr.interactive_payload) {
        openInteractiveBuilder(qr.interactive_payload);
        return;
      }
      const body = qr.content_text ?? "";
      // Separate the snippet from any existing draft with a newline so the
      // words don't run together ("Thanks" + "we'll…" → "Thankswe'll…").
      setText((prev) =>
        prev && !/\s$/.test(prev) ? `${prev}\n${body}` : `${prev}${body}`,
      );
      requestAnimationFrame(() => {
        adjustHeight();
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    },
    [openInteractiveBuilder, adjustHeight],
  );

  // Upload a captured file to chat-media and stage it as a draft.
  const stageUpload = useCallback(
    async (kind: ComposerMediaKind, file: File) => {
      // Per-kind ceiling mirrors Meta's caps (image 5 MB, etc.) so we
      // reject before upload rather than orphaning an object that Meta
      // would then refuse at send.
      const max = MEDIA_MAX_BYTES_BY_KIND[kind];
      if (file.size > max) {
        toast.error(
          `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — ${kind} limit is ${Math.round(
            max / 1024 / 1024,
          )} MB.`,
        );
        return;
      }
      setBusy(true);
      try {
        const { publicUrl, path } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
        // Replacing an existing draft? GC the previous object first.
        removeStaged(draftRef.current?.path);
        setDraft({ kind, mediaUrl: publicUrl, path, filename: file.name, caption: "" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [removeStaged],
  );

  const handlePicked = useCallback(
    (kind: "image" | "video" | "document", file: File | undefined) => {
      if (file) void stageUpload(kind, file);
    },
    [stageUpload],
  );

  // ---- Voice recording (client-side Ogg/Opus, no server transcode) ---

  // The encoded Ogg/Opus file from opus-recorder → upload as an audio
  // draft. WhatsApp renders Ogg/Opus as a playable voice note.
  const finalizeRecording = useCallback(
    async (bytes: Uint8Array) => {
      // Uint8Array is a valid BlobPart at runtime; the cast sidesteps the
      // lib.dom ArrayBufferLike-vs-ArrayBuffer generic mismatch.
      const file = new File([bytes as unknown as BlobPart], `voice-${Date.now()}.ogg`, {
        type: "audio/ogg",
      });
      if (file.size === 0) return; // cancelled / empty take
      if (file.size > MEDIA_MAX_BYTES_BY_KIND.audio) {
        toast.error("Recording is too long (over 16 MB).");
        return;
      }
      setBusy(true);
      try {
        const { publicUrl, path } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
        removeStaged(draftRef.current?.path);
        setDraft({ kind: "audio", mediaUrl: publicUrl, path, filename: file.name, caption: "" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [removeStaged],
  );

  const startRecording = useCallback(async () => {
    if (inputsDisabled || busy || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      toast.error("Voice recording isn't supported in this browser.");
      return;
    }
    try {
      // Lazy-load the encoder (≈400 KB worker) only when the user records,
      // keeping it out of the main bundle.
      const { default: Recorder } = await import("opus-recorder");
      const recorder = new Recorder({
        encoderPath: OPUS_ENCODER_PATH,
        numberOfChannels: 1,
        encoderApplication: 2048, // VOIP — tuned for speech
        encoderSampleRate: 48000,
        streamPages: false, // one callback with the complete file on stop
      });
      cancelledRef.current = false;
      recorder.ondataavailable = (bytes) => {
        if (cancelledRef.current) return;
        void finalizeRecording(bytes);
      };
      recorderRef.current = recorder;
      await recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      void recorderRef.current?.stop().catch(() => {});
      recorderRef.current = null;
      toast.error("Microphone access denied or unavailable.");
    }
  }, [inputsDisabled, busy, recording, finalizeRecording]);

  const stopRecording = useCallback(() => {
    clearTimer();
    setRecording(false);
    void recorderRef.current?.stop().catch(() => {});
  }, [clearTimer]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    setRecording(false);
    void recorderRef.current?.stop().catch(() => {});
  }, [clearTimer]);

  // Auto-stop at the cap so a forgotten recording can't blow the
  // upload size limit.
  useEffect(() => {
    if (recording && recordSeconds >= MAX_RECORDING_SECONDS) {
      stopRecording();
    }
  }, [recording, recordSeconds, stopRecording]);

  // ---- Draft send / discard -----------------------------------------

  const sendDraft = useCallback(() => {
    if (!draft || busy) return;
    onSendMedia({
      kind: draft.kind,
      mediaUrl: draft.mediaUrl,
      path: draft.path,
      // Audio takes no caption (Meta rejects it). Everything else: the
      // trimmed caption, or undefined when blank.
      caption:
        draft.kind === "audio" ? undefined : draft.caption.trim() || undefined,
      filename: draft.kind === "document" ? draft.filename : undefined,
      replyToId: replyTo?.id,
    });
    // The object is now owned by the sent message — clear without GC.
    setDraft(null);
    onClearReply?.();
  }, [draft, busy, onSendMedia, replyTo?.id, onClearReply]);

  // Discard GCs the staged object — it was uploaded but never sent.
  const discardDraft = useCallback(() => {
    removeStaged(draft?.path);
    setDraft(null);
  }, [draft?.path, removeStaged]);

  const setCaption = useCallback((caption: string) => {
    setDraft((d) => (d ? { ...d, caption } : d));
  }, []);

  // ---- Render --------------------------------------------------------

  return (
    // `shrink-0` is load-bearing, not decoration. This is the last flex
    // child of a `flex-col` whose message list is `flex-1` — and
    // `flex-1` means `flex-shrink: 1; flex-basis: 0%`, so the list's
    // scaled shrink factor is zero and it never gives up any height.
    // This bar defaulted to `flex-shrink: 1`, so whenever the column
    // overflowed it absorbed the ENTIRE overflow on its own: on a short
    // viewport (1366x768, 1280x720, or any laptop with browser chrome)
    // the textarea was squeezed and its content spilled up over the
    // message list, which is what "the typing box isn't visible" looked
    // like. It only reproduced on the smaller screens, which is why it
    // looked fine on a big monitor.
    //
    // `z-20` keeps the bar and the emoji popover (which opens upward
    // from inside it) above the scrolling message list.
    //
    // `bg-background`, where this was `bg-card`: the bar is now the
    // RECESSED surface and the textarea is the RAISED one. The token
    // pairs in this app are close in lightness — dark mode `--card`
    // L.18 vs `--muted` L.22 is a 0.04 gap, light mode `--card` L1.0
    // vs `--muted` L.955 is 0.045 — so with a `bg-card` bar the
    // `bg-muted` field was a near-invisible tint difference, which is
    // why the input read as "not there" in dark mode. Putting the
    // lighter surface on the thing you type into is legible in both
    // modes, and the field's border plus `shadow-xs` do the rest.
    <div className="relative z-20 shrink-0 border-t border-border bg-background p-3">
      {replyTo && (
        <div className="mb-2">
          <ReplyQuote
            authorLabel={replyTo.authorLabel}
            preview={replyTo.preview}
            onDismiss={onClearReply}
          />
        </div>
      )}
      {sessionExpired && !isTelegram && !isTextOnly && (
        // The old classes were a light-palette amber (amber-400 /
        // amber-500/10) with no dark: variants, and light is the default
        // mode: amber-400 on a 10%-amber wash over white is roughly
        // 1.9:1, so the hint and the action were effectively invisible
        // until you already knew the session was stale.
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {t("sessionExpiredHint")}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs text-amber-800 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200"
            onClick={onOpenTemplates}
          >
            <LayoutTemplate className="mr-1 h-3 w-3" />
            {t("templates")}
          </Button>
        </div>
      )}

      {/* Hidden file inputs driven by the attach menu. */}
      <input
        ref={imageInputRef}
        type="file"
        accept={PICKER_ACCEPT.image}
        className="hidden"
        onChange={(e) => {
          handlePicked("image", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept={PICKER_ACCEPT.video}
        className="hidden"
        onChange={(e) => {
          handlePicked("video", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept={PICKER_ACCEPT.document}
        className="hidden"
        onChange={(e) => {
          handlePicked("document", e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {draft ? (
        <MediaDraftPreview
          draft={draft}
          busy={busy}
          readOnly={readOnly}
          onCaptionChange={setCaption}
          onDiscard={discardDraft}
          onSend={sendDraft}
          t={t}
        />
      ) : recording ? (
        // Recording bar — replaces the composer while the mic is live.
        // Same surface treatment as the textarea it stands in for, so the
        // swap between the two doesn't jump the layout around.
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-xs">
          <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="flex-1 text-sm text-foreground">
            {t("recording", { current: formatDuration(recordSeconds), max: formatDuration(MAX_RECORDING_SECONDS) })}
          </span>
          <button
            type="button"
            onClick={cancelRecording}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t("cancel")}
          </button>
          <Button
            size="sm"
            onClick={stopRecording}
            className="h-9 w-9 shrink-0 bg-primary p-0 text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            title={t("stopAndAttach")}
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          {/* Attach menu — photo / video / document / voice. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={inputsDisabled || busy || !supportsMedia}
              title={
                readOnly
                  ? t("readOnlyTitle")
                  : !supportsMedia
                    ? isX ? "X Free tier: text only" : "Threads: text only"
                    : inputsDisabled
                      ? undefined
                      : t("attachMedia")
              }
              className={ROW_ICON_BUTTON}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-border bg-popover">
              <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                <ImageIcon className="mr-2 h-4 w-4" />
                {t("photo")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => videoInputRef.current?.click()}>
                <Video className="mr-2 h-4 w-4" />
                {t("video")}
              </DropdownMenuItem>
              {!isInstagram && (
                <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
                  <FileText className="mr-2 h-4 w-4" />
                  {t("document")}
                </DropdownMenuItem>
              )}
              {!isInstagram && (
                <DropdownMenuItem onClick={() => void startRecording()}>
                  <Mic className="mr-2 h-4 w-4" />
                  {t("voiceNote")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* + menu — interactive messages + quick replies (WhatsApp only) */}
          {supportsInteractive && (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={inputsDisabled}
              title={
                readOnly
                  ? t("readOnlyTitle")
                  : inputsDisabled
                    ? undefined
                    : t("moreActions")
              }
              className={ROW_ICON_BUTTON}
            >
              <Plus className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-border bg-popover">
              <DropdownMenuItem onClick={() => openInteractiveBuilder()}>
                <MessageSquareDashed className="mr-2 h-4 w-4" />
                {t("interactiveMessage")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQuickReplyOpen(true)}>
                <Zap className="mr-2 h-4 w-4" />
                {t("quickReplies")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}

          {supportsTemplates && (
          <GatedButton
            variant="ghost"
            size="sm"
            canAct={!readOnly}
            gateReason="send messages"
            title={readOnly ? undefined : t("sendTemplate")}
            className={ROW_ICON_BUTTON}
            onClick={onOpenTemplates}
          >
            <LayoutTemplate className="h-4 w-4" />
          </GatedButton>
          )}

          <GatedButton
            variant="ghost"
            size="sm"
            canAct={!readOnly}
            gateReason="send messages"
            disabled={drafting}
            title={readOnly ? undefined : t("draftWithAI")}
            className={cn(ROW_ICON_BUTTON, "hover:text-primary")}
            onClick={handleDraft}
          >
            {drafting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </GatedButton>

          {/* Emoji picker — inserts at cursor position in the textarea.
              Uses a curated set, not a heavy library. Disabled for
              read-only/session-expired to match the rest of the row. */}
          <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
            <PopoverTrigger
              disabled={sessionExpired || readOnly}
              title={readOnly ? undefined : t("emojiPicker")}
              className={ROW_ICON_BUTTON}
            >
              <SmilePlus className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              sideOffset={6}
              className="flex w-auto flex-wrap gap-1 p-2"
            >
              {COMPOSER_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insertEmoji(e)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition-transform hover:scale-125 hover:bg-muted"
                  aria-label={t("emojiInsert", { emoji: e })}
                >
                  {e}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              readOnly
                ? t("readOnlyPlaceholder")
                : sessionExpired
                  ? t("sessionExpiredPlaceholder")
                  : t("typeMessagePlaceholder")
            }
            disabled={sessionExpired || readOnly}
            rows={1}
            // Mobile keyboard behaviour. Enter already sends (see
            // `handleKeyDown`), so label the key accordingly instead of
            // letting iOS/Android show a bare "return". `sentences`
            // auto-capitalisation and no spellcheck underline match the
            // chat-app convention users expect; neither affects what is
            // actually sent.
            enterKeyHint="send"
            autoCapitalize="sentences"
            autoCorrect="off"
            spellCheck={false}
            // Textarea keeps its own inline title — the GatedButton
            // wrapping pattern doesn't apply to non-button inputs.
            // The placeholder text also surfaces the read-only state.
            title={readOnly ? t("readOnlyTitle") : undefined}
            className={cn(
              // `min-w-0` is required for correctness, not looks: this is
              // a `flex-1` child of a flex row, and a flex item's default
              // `min-width: auto` refuses to shrink below its content,
              // so the textarea's intrinsic width (a bare `<textarea>`
              // defaults to cols=20) pushed the row wider than the
              // conversation panel and dragged the send button off the
              // right edge on tablet and mobile.
              //
              // `bg-card` on a `bg-background` bar: the raised surface on
              // the field, in both modes. `shadow-xs` gives the container
              // an edge in dark mode, where a 0.04 lightness gap between
              // two greys is otherwise invisible.
              //
              // The focus ring is new and deliberate. `outline-none` on
              // its own removed the browser default and left only
              // `focus:border-primary/50` — a 50%-opacity border tint,
              // which is close to invisible and left keyboard and
              // mouse users with no indication of where the caret was.
              // `overflow-y-auto` + `overscroll-contain`: `adjustHeight`
              // caps the field at 96px, so a long message or a 4-line
              // reply has to scroll INSIDE the textarea. Without an
              // explicit overflow the UA default is relied upon, and
              // without `overscroll-contain` reaching the end of that
              // inner scroll chains to the shell and drags the page
              // under the keyboard.
              //
              // `break-words`: a pasted URL or a long customer id is a
              // single unbreakable token and would otherwise stretch the
              // field wider than the row.
              "min-w-0 flex-1 resize-none overflow-y-auto overscroll-contain break-words rounded-xl border border-border bg-card px-4 py-2.5 text-sm leading-relaxed text-foreground shadow-xs",
              "placeholder-muted-foreground",
              "transition-[border-color,box-shadow] outline-none",
              "focus:border-primary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              // A blanket `opacity-50` on the field — the previous
              // treatment — halved the contrast of the PLACEHOLDER, and
              // in the session-expired state the placeholder is the only
              // thing telling the user why they cannot type. Dim the
              // fill and the text instead and leave the placeholder
              // readable.
              (sessionExpired || readOnly) && "cursor-not-allowed bg-card-2 text-muted-foreground",
            )}
          />

          <GatedButton
            size="sm"
            canAct={!readOnly}
            gateReason="send messages"
            disabled={!text.trim() || sessionExpired || sending}
            onClick={handleSend}
            // A focus ring as well as the fill: the send button is the
            // one control a keyboard user tabs to from the textarea, and
            // it had no visible focus state.
            className="h-9 w-9 shrink-0 bg-primary p-0 text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </GatedButton>
        </div>
      )}

      {/* Hint + counter share one reserved-height row.
          It used to carry a hard-coded `pl-[5.5rem]` to line up under
          the textarea's left edge, which cannot be right: the number of
          buttons to the left of the field is per-channel (WhatsApp shows
          attach + interactive + template + AI + emoji, Instagram shows
          only attach + emoji), so 88px lined up with nothing on some
          channels and pushed the text into a cramped indent on others.
          The bar's own left edge is the one alignment that is correct
          for every channel and every width, and it costs no space on
          mobile. `min-h-5` keeps the bar from jumping as the hint is
          replaced by the counter on the first keystroke. */}
      {!draft && !recording && (
        <div className="mt-1.5 flex min-h-5 items-start justify-between gap-3 text-[12px] leading-snug">
          <p className="min-w-0 flex-1 text-muted-foreground">
            {t("draftHint")}
          </p>
          {/* Counter replaces the hint once there is text, and turns
              destructive at the limit. `text-destructive` rather than a
              fixed `text-red-400`: red-400 is a light-mode-tuned red
              and lands around 2.5:1 on the composer bar, so the one
              number the user must react to was the least readable
              thing in the component. The token is defined per mode. */}
          {text.length > 0 && (
            <p
              className={cn(
                "shrink-0 tabular-nums",
                text.length >= TEXT_CHAR_LIMIT
                  ? "font-medium text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {text.length}/{TEXT_CHAR_LIMIT} {t("characters")}
            </p>
          )}
        </div>
      )}

      {/* Interactive-message builder dialog. */}
      <Dialog open={interactiveOpen} onOpenChange={setInteractiveOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("interactiveMessage")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <InteractiveBuilder
              value={interactivePayload}
              onChange={setInteractivePayload}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingQuickReply}
              onClick={saveAsQuickReply}
            >
              {savingQuickReply ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-1 h-4 w-4" />
              )}
              {t("saveAsQuickReply")}
            </Button>
            <Button onClick={sendInteractive}>
              <Send className="mr-1 h-4 w-4" />
              {t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-reply picker. */}
      <QuickReplyPicker
        open={quickReplyOpen}
        onOpenChange={setQuickReplyOpen}
        onPick={handlePickQuickReply}
      />
    </div>
  );
}

/**
 * Staged-attachment preview with caption + send/discard. Declared at
 * module scope (not nested in MessageComposer) so React keeps it mounted
 * across the parent's re-renders — a nested component would remount the
 * caption input on every keystroke and drop focus.
 */
function MediaDraftPreview({
  draft,
  busy,
  readOnly,
  onCaptionChange,
  onDiscard,
  onSend,
  t,
}: {
  draft: MediaDraft;
  busy: boolean;
  readOnly: boolean;
  onCaptionChange: (caption: string) => void;
  onDiscard: () => void;
  onSend: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    // The panel is the recessed surface and the caption field sits
    // inside it. `bg-muted` at full strength, not `bg-muted/40`: at 40%
    // the panel was a tint so faint it read as part of the bar behind
    // it and the whole attachment state looked like nothing had
    // happened. Against the `bg-background` bar the panel is now
    // clearly a distinct surface in both modes.
    <div className="rounded-xl border border-border bg-muted p-3 shadow-xs">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {draft.kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.mediaUrl}
              alt={draft.filename}
              className="max-h-40 rounded-lg border border-border object-cover"
            />
          )}
          {draft.kind === "video" && (
            <video src={draft.mediaUrl} controls className="max-h-40 rounded-lg border border-border" />
          )}
          {draft.kind === "audio" && (
            <audio src={draft.mediaUrl} controls className="h-9 w-full" />
          )}
          {draft.kind === "document" && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="truncate">{draft.filename}</span>
            </div>
          )}
        </div>
        {/* 36x36 to match every other control in the composer, so the
            discard affordance lines up with the send button it sits
            opposite. It was `rounded p-1`, a ~24px target floating
            above the row with no focus state. */}
        <button
          type="button"
          onClick={onDiscard}
          aria-label={t("removeAttachment")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-end gap-2">
        {draft.kind !== "audio" && (
          <input
            value={draft.caption}
            maxLength={MEDIA_CAPTION_MAX}
            onChange={(e) => onCaptionChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={t("addCaption")}
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm leading-relaxed text-foreground shadow-xs placeholder-muted-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-muted"
          />
        )}
        <GatedButton
          size="sm"
          canAct={!readOnly}
          gateReason="send messages"
          disabled={busy}
          onClick={onSend}
          // Identical treatment to the text composer's send button so
          // the primary action looks the same in both states.
          className={cn(
            "h-9 w-9 shrink-0 bg-primary p-0 text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-40",
            draft.kind === "audio" && "ml-auto",
          )}
        >
          <Send className="h-4 w-4" />
        </GatedButton>
      </div>
    </div>
  );
}
