// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import "@testing-library/jest-dom/vitest"
import en from "../../../messages/en.json"

// Regression cover for the inbox composer's visibility.
//
// The reported symptom was "the typing box isn't visible", which turned
// out to be four independent layout faults rather than a colour choice:
//
//   1. the bar is a `flex-shrink: 1` child of a column whose message
//      list is `flex-1` (basis 0, so it never shrinks) — the bar took
//      the whole overflow and got squeezed on short viewports
//   2. the field had `outline-none` and no ring, so there was no focus
//      indicator at all
//   3. the textarea was a `flex-1` flex item with no `min-w-0`, so its
//      intrinsic width pushed the send button off the panel
//   4. `bg-muted` on a `bg-card` bar is a 0.04 lightness difference in
//      dark mode, so the field had no readable boundary
//
// happy-dom does no layout, so these assert the class contracts the
// measurements were derived from rather than pixels. Each one fails
// against the old markup.

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))

// The gating hook decides whether the user may send at all. Answering
// "yes" keeps the real GatedButton in play, so a regression that broke
// the send path would fail here too rather than being masked.
vi.mock("@/hooks/use-can", () => ({
  useCan: () => true,
}))

import { MessageComposer } from "./message-composer"

function renderComposer(overrides: Record<string, unknown> = {}) {
  const props = {
    conversationId: "c1",
    platform: "whatsapp" as const,
    sessionExpired: false,
    onSend: vi.fn(),
    onSendMedia: vi.fn(),
    onSendInteractive: vi.fn(),
    onOpenTemplates: vi.fn(),
    replyTo: null,
    onClearReply: vi.fn(),
    ...overrides,
  }
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MessageComposer {...(props as unknown as React.ComponentProps<typeof MessageComposer>)} />
    </NextIntlClientProvider>,
  )
}

function textarea() {
  return screen.getByRole("textbox") as HTMLTextAreaElement
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("inbox composer container", () => {
  it("will not be squeezed by the message list", () => {
    // The message list is `flex-1`, i.e. `flex-shrink: 1` with
    // `flex-basis: 0%`, so its scaled shrink factor is 0 and it never
    // yields height. Without `shrink-0` here the bar absorbed the entire
    // column overflow and the textarea was pushed out of the panel.
    renderComposer()

    const bar = textarea().closest("div.border-t") as HTMLElement
    expect(bar).not.toBeNull()
    expect(bar.classList.contains("shrink-0")).toBe(true)
  })

  it("sits above the scrolling message list", () => {
    renderComposer()

    const bar = textarea().closest("div.border-t") as HTMLElement
    expect(bar.classList.contains("relative")).toBe(true)
    expect(bar.classList.contains("z-20")).toBe(true)
  })
})

describe("inbox composer text field", () => {
  it("shows a clear focus ring instead of killing the outline", () => {
    // `outline-none` with only a 50%-opacity border tint left keyboard
    // and mouse users with no indication of where the caret was.
    renderComposer()

    const cls = textarea().classList
    expect(cls.contains("outline-none")).toBe(true)
    expect(cls.contains("focus-visible:ring-2")).toBe(true)
    expect(cls.contains("focus-visible:ring-ring/60")).toBe(true)
    expect(cls.contains("focus-visible:ring-offset-2")).toBe(true)
    expect(cls.contains("focus:border-primary")).toBe(true)
  })

  it("can shrink so the send button stays on screen", () => {
    // A flex item defaults to `min-width: auto` and refuses to shrink
    // below its content, so the textarea's intrinsic width dragged the
    // row wider than the conversation panel on tablet and mobile.
    renderComposer()

    const cls = textarea().classList
    expect(cls.contains("min-w-0")).toBe(true)
    expect(cls.contains("flex-1")).toBe(true)
  })

  it("is a raised surface, distinct from the bar behind it", () => {
    // The bar is `bg-background` and the field is `bg-card`, so the
    // surface you type into is the lighter of the two in both modes.
    renderComposer()

    const cls = textarea().classList
    expect(cls.contains("bg-card")).toBe(true)
    expect(cls.contains("border-border")).toBe(true)
    // A border and an edge, because the lightness gap alone does not
    // read as a field in dark mode.
    expect(cls.contains("shadow-xs")).toBe(true)
  })

  it("has readable text and a muted but legible placeholder", () => {
    renderComposer()

    const cls = textarea().classList
    expect(cls.contains("text-foreground")).toBe(true)
    expect(cls.contains("placeholder-muted-foreground")).toBe(true)
  })

  it("grows for multiline input rather than scrolling one line", async () => {
    const user = userEvent.setup()
    renderComposer()

    const el = textarea()
    // `rows={1}` plus a JS auto-grow handler: multiline is handled by
    // the component, so the field must stay `resize-none` and must not
    // carry a fixed height that would fight the handler.
    expect(el.getAttribute("rows")).toBe("1")
    expect(el.classList.contains("resize-none")).toBe(true)
    expect(el.style.height).toBe("")

    await user.type(el, "line one{Shift>}{Enter}{/Shift}line two")
    expect(el.value).toContain("\n")
  })

  it("sends on Enter and keeps Shift+Enter as a newline", async () => {
    // The behaviour that existed before any of this work, pinned so a
    // styling change cannot quietly break sending.
    const onSend = vi.fn()
    const user = userEvent.setup()
    renderComposer({ onSend })

    await user.type(textarea(), "hi there")
    await user.type(textarea(), "{Enter}")
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend.mock.calls[0][0]).toBe("hi there")
    expect(textarea().value).toBe("")

    onSend.mockClear()
    await user.type(textarea(), "a{Shift>}{Enter}{/Shift}b")
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe("a\nb")
  })

  it("scrolls a long message inside the field instead of clipping it", () => {
    // `adjustHeight` caps the field at 96px, so a long message or a
    // 4-line reply has to scroll inside the textarea. `overscroll-contain`
    // stops that inner scroll from chaining to the shell and dragging
    // the page out from under the mobile keyboard.
    renderComposer()

    const cls = textarea().classList
    expect(cls.contains("overflow-y-auto")).toBe(true)
    expect(cls.contains("overscroll-contain")).toBe(true)
  })

  it("wraps a single unbreakable token instead of stretching the row", () => {
    // A pasted URL or a long customer id is one token; without this it
    // would widen the field past the conversation panel.
    renderComposer()

    expect(textarea().classList.contains("break-words")).toBe(true)
  })

  it("labels the mobile keyboard's return key and uses chat conventions", () => {
    renderComposer()

    const el = textarea()
    // Enter already sends, so the key says "send" instead of "return".
    expect(el.getAttribute("enterkeyhint")).toBe("send")
    expect(el.getAttribute("autocapitalize")).toBe("sentences")
    expect(el.getAttribute("autocorrect")).toBe("off")
    expect(el.getAttribute("spellcheck")).toBe("false")
  })
})

describe("inbox composer hint and counter", () => {
  it("does not indent the hint by a hard-coded pixel guess", () => {
    // The row used to carry `pl-[5.5rem]` to line up under the field's
    // left edge. The number of buttons left of the field is per-channel
    // (WhatsApp shows 5, Instagram 2), so a fixed indent lined up with
    // nothing on some channels and wasted space on mobile.
    renderComposer()

    const hint = screen.getByText(en.Inbox.composer.draftHint)
    const row = hint.parentElement as HTMLElement
    for (const el of [row, hint]) {
      for (const cls of Array.from(el.classList)) {
        expect(cls).not.toMatch(/^pl-\[/)
        expect(cls).not.toMatch(/^pr-\[/)
      }
    }
    // A reserved height so the bar does not jump when the hint is
    // replaced by the counter on the first keystroke.
    expect(row.classList.contains("min-h-5")).toBe(true)
  })

  it("shows a counter and turns it destructive at the limit", () => {
    renderComposer()
    // Counter is hidden while the field is empty.
    expect(screen.queryByText(/4096 characters/)).toBeNull()

    const limit = 4096
    fireEvent.change(textarea(), { target: { value: "x".repeat(limit) } })
    const counter = screen.getByText(new RegExp(`${limit}/4096`))
    expect(counter.classList.contains("text-destructive")).toBe(true)
    expect(counter.classList.contains("tabular-nums")).toBe(true)

    fireEvent.change(textarea(), { target: { value: "x".repeat(10) } })
    const under = screen.getByText(/10\/4096/)
    expect(under.classList.contains("text-destructive")).toBe(false)
    expect(under.classList.contains("text-muted-foreground")).toBe(true)
  })
})

describe("inbox composer controls", () => {
  /** The send control is the field's next sibling. It is icon-only and
   *  `GatedButton` wraps it in a `<span>` for its tooltip, so it has no
   *  accessible name and cannot be found by role+name. */
  function sendButton(): HTMLButtonElement {
    const wrapper = textarea().nextElementSibling as HTMLElement
    return wrapper.querySelector("button") as HTMLButtonElement
  }

  it("keeps the send button visible and enabled once there is text", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    renderComposer({ onSend })

    const send = sendButton()
    expect(send).not.toBeNull()
    expect(send.classList.contains("bg-primary")).toBe(true)
    expect(send.classList.contains("shrink-0")).toBe(true)
    // Disabled-but-visible when empty; the fill is what makes the
    // control readable, so it must not be `hidden` or transparent.
    expect(send.classList.contains("disabled:opacity-40")).toBe(true)
    expect(send.disabled).toBe(true)

    await user.type(textarea(), "hello")
    expect(sendButton().disabled).toBe(false)
  })

  it("keeps the attachment and emoji controls present and enabled", () => {
    renderComposer()

    const attach = document.querySelector('[title="Attach media"]')
    const emoji = document.querySelector('[title="Insert emoji"]')
    expect(attach).not.toBeNull()
    expect(emoji).not.toBeNull()

    for (const el of [attach, emoji] as Element[]) {
      const cls = el.classList
      expect(cls.contains("h-9")).toBe(true)
      expect(cls.contains("w-9")).toBe(true)
      expect(cls.contains("shrink-0")).toBe(true)
      expect(cls.contains("text-muted-foreground")).toBe(true)
      expect(cls.contains("hover:bg-card")).toBe(true)
      // No control in the row was reachable by keyboard without a
      // visible focus state.
      expect(cls.contains("focus-visible:ring-2")).toBe(true)
    }
  })

  it("does not blank out the placeholder when input is disabled", () => {
    // The blanket `opacity-50` halved the contrast of the placeholder,
    // and in the session-expired state the placeholder is the only thing
    // explaining why the user cannot type.
    renderComposer({ sessionExpired: true })

    const cls = textarea().classList
    expect(cls.contains("opacity-50")).toBe(false)
    expect(cls.contains("cursor-not-allowed")).toBe(true)
    expect(textarea().value).toBe("")
  })
})
