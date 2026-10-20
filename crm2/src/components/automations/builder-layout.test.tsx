// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import "@testing-library/jest-dom/vitest"
import en from "../../../messages/en.json"

// Regression cover for the layout invariants behind "the builder looks
// right locally and broken in production".
//
// These are not visual assertions — happy-dom has no layout engine, so
// nothing here measures a pixel. They assert the STRUCTURE that the
// measurements came from: a card's controls are in the flow rather than
// layered on top of its text, every card on the canvas shares one
// width cap, the readiness badge is a flex box at every width, and the
// config panel sizes itself from its container instead of from a
// hard-coded viewport calculation. Each of those was a real defect, and
// each is easy to reintroduce without any test noticing.

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))

vi.mock("@/lib/supabase/client", () => {
  const empty = () =>
    Promise.resolve({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    })
  const order = () => empty()
  const eq = () => ({ order })
  const select = () => ({ order, eq })
  return {
    createClient: () => ({
      from: () => ({ select }),
    }),
  }
})

import { AutomationBuilder, type BuilderInitial } from "./automation-builder"
import { StepCard } from "./step-card"
import { BranchForks } from "./condition-branches"

const initial: BuilderInitial = {
  id: undefined,
  name: "",
  description: "",
  trigger_type: "new_message_received",
  trigger_config: {},
  is_active: false,
  steps: [],
}

/** Walk up to the nearest ancestor carrying `token` as a whole class. */
function closestWithClass(el: Element, token: string): HTMLElement {
  let node: HTMLElement | null = el as HTMLElement
  while (node) {
    if (node.classList.contains(token)) return node
    node = node.parentElement
  }
  throw new Error(`no ancestor with class "${token}"`)
}

/** The nearest ancestor (or self) that constrains width, as a raw
 *  class string. Arbitrary values survive into the DOM verbatim, so
 *  this can be compared literally rather than approximated. */
function widthCapOf(el: Element): string {
  let node: HTMLElement | null = el as HTMLElement
  while (node) {
    const cap = Array.from(node.classList).find((c) => c.startsWith("max-w-["))
    if (cap) return cap
    node = node.parentElement
  }
  return ""
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function renderBuilder(overrides: Partial<BuilderInitial> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AutomationBuilder initial={{ ...initial, ...overrides }} />
    </NextIntlClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// The resources provider fetches pipelines/tags/agents on mount. Left
// real, those requests are still in flight when happy-dom tears the
// window down and every one of them throws an AbortError into the run.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ members: [], data: [] }),
    })),
  )
})

describe("automation builder canvas layout", () => {
  it("gives every step card the same width cap as the trigger node", () => {
    // The trigger wrapper and the empty state were capped at 22rem but
    // the step cards were `w-full` inside a `max-w-2xl` column, so on a
    // wide monitor the cards stretched to ~640px while the trigger above
    // them stayed 352px. One measure, or the column reads as two
    // misaligned halves.
    renderBuilder({
      steps: [
        { cid: "a1", step_type: "send_message", step_config: { text: "hi" } },
      ],
    })

    const triggerMeasure = widthCapOf(screen.getByText("When this starts"))
    expect(triggerMeasure).toBe("max-w-[22rem]")

    const cardMeasure = widthCapOf(
      closestWithClass(screen.getByText("Send Message"), "group/step"),
    )
    expect(cardMeasure).toBe(triggerMeasure)
  })

  it("lays a step card's controls out in the flow instead of over its text", () => {
    // The controls used to be `absolute top-1.5 right-1.5` inside the
    // card, which put a ~104px opaque cluster on top of the eyebrow and
    // the title — the two lines that name the step. Below `sm` the
    // escape hatch was `max-sm:mt-auto`, but the card is a block, not a
    // flex column, so `mt-auto` resolved to 0 and the buttons landed
    // flush against the border with no padding.
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <StepCard
          step={{
            cid: "a1",
            step_type: "send_message",
            step_config: { text: "hi" },
          }}
          selected={false}
          onSelect={() => {}}
          onDuplicate={() => {}}
          onDelete={() => {}}
          dragHandle={<span>handle</span>}
        />
      </NextIntlClientProvider>,
    )

    const controls = closestWithClass(screen.getByRole("button", { name: "Delete" }), "justify-end")
    expect(controls.classList.contains("absolute")).toBe(false)
    expect(controls.classList.contains("sticky")).toBe(false)
    // Horizontal padding, so the row is inset from the card border.
    expect(Array.from(controls.classList).some((c) => c.startsWith("px-"))).toBe(true)
  })

  it("reveals a card's controls with opacity, which cannot reflow the canvas", () => {
    // If the controls' visibility came from something in the layout —
    // `hidden`, a conditional render, a collapsed row — hovering a card
    // would push every card below it down, which is the reflow the
    // docked panel was introduced to prevent.
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <StepCard
          step={{
            cid: "a1",
            step_type: "send_message",
            step_config: { text: "hi" },
          }}
          selected={false}
          onSelect={() => {}}
          onDuplicate={() => {}}
          onDelete={() => {}}
        />
      </NextIntlClientProvider>,
    )

    const controls = closestWithClass(screen.getByRole("button", { name: "Delete" }), "justify-end")
    expect(controls.classList.contains("opacity-0")).toBe(true)
    expect(controls.classList.contains("group-hover/step:opacity-100")).toBe(true)
  })

  it("renders the readiness badge as a flex box at every width", () => {
    // The not-ready badge used to carry `sm:inline-flex` but no base
    // `inline-flex`, so below 640px it fell back to `display: inline`
    // where `gap` and `py-1` are both inert — the badge that tells the
    // user their workflow cannot be activated was the one that rendered
    // with its text sitting on its own border.
    renderBuilder()

    const badge = screen.getByText("1 thing needs attention")
    expect(badge.classList.contains("inline-flex")).toBe(true)
    expect(badge.classList.contains("items-center")).toBe(true)
    expect(badge.classList.contains("shrink-0")).toBe(true)
  })

  it("sizes the docked config panel from its container, not the viewport", () => {
    // The panel used to carry a hard-coded viewport height — a
    // `100dvh` calc minus `--app-header-h`. That variable is defined
    // nowhere in this app, so the fallback always won, and the fallback
    // (3.5rem) is smaller than the real header (36px of control plus
    // `py-3` either side and a border ≈ 61px), so the panel was a few
    // pixels taller than the row it sits in and spilled past the bottom
    // of the viewport.
    stubMatchMedia(true)
    renderBuilder()

    const panel = screen.getByLabelText("Step settings")
    const inner = panel.firstElementChild as HTMLElement

    expect(inner.classList.contains("h-full")).toBe(true)
    expect(inner.classList.contains("min-h-0")).toBe(true)
    expect(inner.className).not.toContain("--app-header-h")
    expect(inner.className).not.toContain("100dvh")
    // `sticky` inside an ancestor that never scrolls does nothing, and
    // hides the fact that the height is coming from somewhere.
    expect(inner.classList.contains("sticky")).toBe(false)
  })

  it("gives the mobile config sheet a definite height so its form can scroll", async () => {
    // With only `max-h-[88dvh]` the sheet's height was `auto`, so the
    // panel's `h-full` had no definite height to resolve against, the
    // panel grew to its content height, and `max-h` clipped the bottom
    // — taking the delete/duplicate footer with it.
    stubMatchMedia(false)
    const user = userEvent.setup()
    renderBuilder({
      steps: [{ cid: "a1", step_type: "send_message", step_config: { text: "hi" } }],
    })

    // The sheet only mounts once a step is selected.
    await user.click(screen.getByText("Send Message"))

    const sheet = await screen.findByRole("dialog")
    expect(sheet.classList.contains("h-[88dvh]")).toBe(true)
    expect(sheet.classList.contains("max-h-[88dvh]")).toBe(true)
    expect(sheet.classList.contains("overflow-hidden")).toBe(true)
  })
})

describe("automation builder condition branches", () => {
  it("splits a condition's two paths only when both columns can hold a card", () => {
    // The container is the condition card, which is capped at 22rem
    // (352px). The split was gated on `@sm` (24rem / 384px), a
    // threshold the container can never reach, so the two-column fork
    // and its connector were dead code at every viewport. `@lg` (32rem)
    // is the width at which two columns can actually hold a step card.
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <BranchForks
          step={{ cid: "c1", step_type: "condition", step_config: {}, branches: { yes: [], no: [] } }}
          selectedCid={null}
          onSelect={() => {}}
          onInsert={() => {}}
          onDuplicate={() => {}}
          onDelete={() => {}}
        />
      </NextIntlClientProvider>,
    )

    const grid = closestWithClass(screen.getByText("Yes"), "grid")
    expect(grid.classList.contains("@lg:grid-cols-2")).toBe(true)
    expect(grid.classList.contains("@sm:grid-cols-2")).toBe(false)
  })

  it("keeps a branch header inside its own column", () => {
    // The YES/NO pill held a label plus a whole caption sentence on one
    // non-wrapping line, which is wider than the column — so the caption
    // ran straight through the neighbouring column's cards.
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <BranchForks
          step={{ cid: "c1", step_type: "condition", step_config: {}, branches: { yes: [], no: [] } }}
          selectedCid={null}
          onSelect={() => {}}
          onInsert={() => {}}
          onDuplicate={() => {}}
          onDelete={() => {}}
        />
      </NextIntlClientProvider>,
    )

    const header = closestWithClass(screen.getByText("Yes"), "uppercase")
    expect(header.classList.contains("flex-wrap")).toBe(true)
    expect(header.classList.contains("max-w-full")).toBe(true)
  })
})
