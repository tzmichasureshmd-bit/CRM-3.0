// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import "@testing-library/jest-dom/vitest"
import en from "../../../messages/en.json"

const replaceMock = vi.fn()
const pushMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
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

// Typed, so a test can pass any step type and any trigger: an
// unannotated literal narrows `steps` to `never[]` and `trigger_type`
// to a single member, which the per-test overrides then can't satisfy.
const baseInitial: BuilderInitial = {
  id: undefined,
  name: "",
  description: "",
  trigger_type: "new_message_received",
  trigger_config: {},
  is_active: false,
  steps: [],
}

const STEP_LABELS = [
  "Send Message",
  "Send Buttons",
  "Send List",
  "Send Template",
  "Add Tag",
  "Remove Tag",
  "Assign Conversation",
  "Update Contact Field",
  "Create Deal",
  "Wait",
  "Condition (If/Else)",
  "Send Webhook",
  "Close Conversation",
]

function renderBuilder(overrides: Partial<BuilderInitial> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AutomationBuilder initial={{ ...baseInitial, ...overrides }} />
    </NextIntlClientProvider>,
  )
}

// The builder renders a full-screen shell with its own portals, so
// leftover DOM from one test makes the next one's queries ambiguous
// ("found 2 elements named 'Ready to run'"). The repo has no global
// testing-library cleanup, so each test cleans up after itself.
afterEach(() => {
  cleanup()
})

describe("automation builder add-step menu", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ members: [] }),
      })),
    )
  })

  it("clicking + opens the step menu and inserting a step renders its editor", async () => {
    const user = userEvent.setup()
    renderBuilder()

    const addButtons = await screen.findAllByRole("button", { name: "Add step" })
    expect(addButtons.length).toBeGreaterThan(0)

    await user.click(addButtons[0])

    const menu = await screen.findByRole("menu")
    for (const label of STEP_LABELS) {
      expect(within(menu).getByText(label)).toBeInTheDocument()
    }

    await user.click(within(menu).getByText("Send Message"))

    expect(
      await screen.findByPlaceholderText("Hi! Thanks for reaching out…"),
    ).toBeInTheDocument()
  })
})

describe("automation builder canvas", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ members: [] }),
      })),
    )
  })

  it("adds a step into a condition's branch and shows both forks", async () => {
    const user = userEvent.setup()
    renderBuilder()

    const addButtons = await screen.findAllByRole("button", { name: "Add step" })
    await user.click(addButtons[0])
    const menu = await screen.findByRole("menu")
    await user.click(within(menu).getByText("Condition (If/Else)"))

    // Both paths exist from the moment the condition lands, each with
    // its own add button — a branch you have to create is a branch that
    // gets forgotten.
    expect(await screen.findByText("Yes")).toBeInTheDocument()
    expect(await screen.findByText("No")).toBeInTheDocument()
    const addInBranch = await screen.findAllByRole("button", { name: "Add step" })
    await user.click(addInBranch[addInBranch.length - 1])
    const branchMenu = await screen.findByRole("menu")
    await user.click(within(branchMenu).getByText("Add Tag"))

    // The step is visible on the canvas, inside the branch.
    expect((await screen.findAllByText("Add Tag")).length).toBeGreaterThan(0)
  })

  it("duplicates a step and binds the panel to the copy, not the original", async () => {
    // The copy has to be the selected one. A duplicate that lands on the
    // canvas while the panel still shows the original reads as though
    // the button did nothing — and the edit then lands on the wrong
    // step when the user types.
    const user = userEvent.setup()
    renderBuilder({
      steps: [{ cid: "a", step_type: "send_message", step_config: { text: "original text" } }],
    })

    await user.click(await screen.findByRole("button", { name: "Duplicate" }))

    const body = await screen.findByPlaceholderText("Hi! Thanks for reaching out…")
    expect(body).toHaveValue("original text")

    await user.clear(body)
    await user.type(body, "changed")
    await user.tab()

    // Read the two cards' own text rather than the quoted summary
    // string, so the assertion doesn't depend on which quote character
    // the summary happens to wrap the body in.
    const cards = screen.getAllByRole("button", { name: /Send Message/ })
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent("original text")
    expect(cards[1]).toHaveTextContent("changed")
  })

  it("deletes the step it was asked to delete", async () => {
    const user = userEvent.setup()
    renderBuilder({
      steps: [
        { cid: "a", step_type: "send_message", step_config: { text: "first" } },
        { cid: "b", step_type: "add_tag", step_config: { tag_id: "t1" } },
      ],
    })

    const remove = await screen.findAllByRole("button", { name: "Delete" })
    await user.click(remove[0])

    await waitFor(() => {
      expect(screen.queryByText("Send Message")).not.toBeInTheDocument()
    })
    expect(screen.getByText("Add Tag")).toBeInTheDocument()
  })
})

describe("automation builder readiness", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ members: [] }),
      })),
    )
  })

  it("says ready when the trigger and every step are configured", async () => {
    renderBuilder({
      steps: [{ cid: "a", step_type: "send_message", step_config: { text: "hi" } }],
    })
    expect(await screen.findByText("Ready to run")).toBeInTheDocument()
  })

  it("does not call a workflow with no steps ready", async () => {
    // The server refuses to activate it, so a green badge here would be
    // a lie the user pays for at activation time.
    renderBuilder()
    expect(await screen.findByText("1 thing needs attention")).toBeInTheDocument()
    expect(screen.queryByText("Ready to run")).not.toBeInTheDocument()
  })

  it("takes you to the step that needs attention", async () => {
    const user = userEvent.setup()
    renderBuilder({
      steps: [
        { cid: "a", step_type: "send_message", step_config: { text: "fine" } },
        { cid: "b", step_type: "send_message", step_config: {} },
      ],
    })

    await user.click(await screen.findByText("1 thing needs attention"))

    // The offending step's editor, not just any editor: the first
    // message body is the one that is empty.
    const bodies = await screen.findAllByPlaceholderText("Hi! Thanks for reaching out…")
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toHaveValue("")
  })

  it("takes you to the trigger when the trigger is what's unconfigured", async () => {
    const user = userEvent.setup()
    renderBuilder({
      trigger_type: "keyword_match",
      trigger_config: {},
      steps: [{ cid: "a", step_type: "send_message", step_config: { text: "fine" } }],
    })

    await user.click(await screen.findByText("1 thing needs attention"))

    // The trigger's own editor, not a step's: the steps are all fine.
    const label = await screen.findByText("Keywords")
    const input = label.parentElement?.querySelector("input")
    expect(input).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("Hi! Thanks for reaching out…")).toBeNull()
  })
})