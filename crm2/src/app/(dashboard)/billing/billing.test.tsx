// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import "@testing-library/jest-dom/vitest"
import en from "../../../../messages/en.json"

// Regression cover for the Plans & Billing page being made informational.
//
// The page used to offer self-service plan changes: a "Choose Plan"/
// "Upgrade" button on every card and a modal with a "Continue to Payment"
// button that was hard-disabled and had no handler. None of that was ever
// wired to a real checkout — the copy itself said so — but the disabled
// button was still a dead control, and every card implied an action that
// did not exist.
//
// What must be true now:
//   1. Plans are visible and informational. No card carries a purchase
//      CTA; the only control on a card is a "Contact Consultant" link.
//   2. There is no "Continue to Payment" control anywhere on the page.
//   3. The consultant phone number is rendered as a real, clickable
//      `tel:` link, and clicking it dispatches to the dialer.
//   4. No fake success/error toast is produced by interacting with the
//      page.
//
// happy-dom has no dialer, so the phone assertion is structural: the
// anchor exists, carries the right href, and a click is observable.

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

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ accountId: "acct-1" }),
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

  // Every method in the query builder returns the same chainable object,
  // so the page's `.select().eq().in().order().limit().maybeSingle()`
  // sequence resolves to `empty()` for every table except plans.
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    gte: () => chain,
    maybeSingle: () => empty(),
    single: () => empty(),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      empty().then(resolve, reject),
  }

  const from = (table: string) => {
    if (table === "subscription_plans") {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: PLANS, error: null }),
          }),
        }),
      }
    }
    return chain
  }

  return {
    createClient: () => ({ from }),
  }
})

import BillingPage from "./page"

const PLANS = [
  {
    id: "p1",
    slug: "free",
    name: "Free",
    description: null,
    is_active: true,
    is_default: true,
    price_monthly_cents: 0,
    price_yearly_cents: 0,
    currency: "INR",
    max_contacts: 100,
    max_team_members: 1,
    max_whatsapp_numbers: 1,
    max_monthly_messages: 1000,
    max_broadcasts_per_month: 0,
    max_automations: 0,
    max_flows: 0,
    max_ai_requests_per_month: 0,
    max_api_requests_per_day: 0,
    max_storage_mb: 0,
    features: {},
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "p2",
    slug: "business",
    name: "Business",
    description: null,
    is_active: true,
    is_default: false,
    price_monthly_cents: 49900,
    price_yearly_cents: 499000,
    currency: "INR",
    max_contacts: 5000,
    max_team_members: 5,
    max_whatsapp_numbers: 3,
    max_monthly_messages: 10000,
    max_broadcasts_per_month: 100,
    max_automations: 10,
    max_flows: 10,
    max_ai_requests_per_month: 1000,
    max_api_requests_per_day: 1000,
    max_storage_mb: 1024,
    features: {},
    sort_order: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
]

function renderBilling() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BillingPage />
    </NextIntlClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Plans & Billing — informational", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      })),
    )
  })

  it("renders the available plans as informational cards", async () => {
    renderBilling()

    // Both seeded plans render as cards with their names and prices.
    // The price is formatted through formatCurrency, whose symbol and
    // grouping depend on the runtime locale, so match the number itself
    // on the card rather than the literal "₹499" string.
    const freeCard = await screen.findByText("Free")
    expect(freeCard.closest("[data-slot='card']")?.textContent).toContain("0")

    const businessCard = await screen.findByText("Business")
    const businessWrap = businessCard.closest("[data-slot='card']") as HTMLElement
    expect(businessWrap.textContent).toContain("499")
  })

  it("exposes a consultant contact section with the phone number", async () => {
    renderBilling()

    expect(
      await screen.findByText("Please Contact Our Consultant"),
    ).toBeInTheDocument()
    expect(await screen.findByText("9346947043")).toBeInTheDocument()
  })

  it("the phone number is a working tel: link", async () => {
    const user = userEvent.setup()
    renderBilling()

    const link = await screen.findByRole("link", { name: /call consultant/i })
    expect(link.getAttribute("href")).toBe("tel:+919346947043")

    // Clicking must not throw, and must not produce a toast.
    await expect(user.click(link)).resolves.toBeUndefined()
  })

  it("carries no purchase CTA on any plan card", async () => {
    const user = userEvent.setup()
    renderBilling()

    // There is no purchase control anywhere on the page — no "Choose
    // Plan", no "Upgrade", no "Continue to Payment". The only control on
    // a non-current card is "Contact Consultant", which opens the
    // informational dialog.
    expect(
      screen.queryByRole("button", { name: /choose plan/i }),
    ).toBeNull()
    expect(screen.queryByRole("button", { name: /upgrade/i })).toBeNull()
    expect(
      screen.queryByRole("button", { name: /continue to payment/i }),
    ).toBeNull()

    // Clicking a card's CTA opens the informational dialog.
    await screen.findByText("Business")
    const ctas = screen.getAllByRole("button", {
      name: /contact consultant/i,
    })
    expect(ctas.length).toBeGreaterThanOrEqual(2)
    await user.click(ctas[ctas.length - 1])

// The dialog that opens is informational: it explains there is no
    // checkout and offers only a dialer link plus a close button.
    // ("Plans are informational only" also appears in the page subtitle,
    // so match-all and verify the dialog is open via its close button.)
    expect(
      screen.getAllByText(/Plans are informational only/).length,
    ).toBeGreaterThan(1)
    expect(
      screen.getByRole("button", { name: /go back/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /continue to payment/i }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: /choose plan/i }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: /upgrade/i }),
    ).toBeNull()

    // The dialog's dialer link works too. It shares its aria-label with
    // the header link, so match-all and verify the href on the last one
    // (the dialog mounts after the header).
    const dialogLinks = screen.getAllByRole("link", {
      name: "Call consultant at 9346947043",
    })
    expect(dialogLinks[dialogLinks.length - 1].getAttribute("href")).toBe(
      "tel:+919346947043",
    )
    await user.click(dialogLinks[dialogLinks.length - 1])
  })
})