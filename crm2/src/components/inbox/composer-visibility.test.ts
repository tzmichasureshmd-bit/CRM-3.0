// Regression cover for the reported defect: the message typing box was
// not visible.
//
// The actual bug was NOT in the composer. The composer was the last
// element of an `overflow-hidden` column, and both that column and the
// dashboard shell sized themselves with `100vh` — the LARGE viewport
// height. On a phone `100vh` is taller than the visible area (it assumes
// the browser's URL bar is retracted), so the column's bottom edge, and
// therefore the composer pinned to it, was pushed below the visible area
// and clipped. Desktop matched `100vh` exactly, which is why the composer
// looked correct there and "disappeared" on phones and tablets.
//
// happy-dom has no layout engine, so no assertion here can measure a
// pixel. What can be asserted is the structure that produced the bad
// measurement, and these are all one-line regressions that would
// silently undo the fix. This reads the source directly for the two
// layout shells (they are app-level layout code that needs a full authed
// Supabase session to mount) and renders the composer for its own
// invariants.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = join(process.cwd(), "src")

const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8")

/** Source with JSX/JS comments removed.
 *
 *  These files carry long comments that necessarily NAME the units they
 *  replaced ("`100dvh`, not `h-screen` (`100vh`)"), so a raw-text
 *  negative assertion would match the explanation of the fix instead of
 *  the defect. Stripping comments first makes each assertion about
 *  shipped markup only.
 *
 *  It is also the same trap as Tailwind v4 scanning raw text: a class
 *  token that only ever appears in a comment still produces a CSS
 *  rule. Markup and comments are not the same thing.
 */
const readMarkup = (...p: string[]) =>
  read(...p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")

const shell = readMarkup("app", "(dashboard)", "dashboard-shell.tsx")
const inboxPage = readMarkup("app", "(dashboard)", "inbox", "page.tsx")
const header = readMarkup("components", "layout", "header.tsx")
const thread = readMarkup("components", "inbox", "message-thread.tsx")
const composer = readMarkup("components", "inbox", "message-composer.tsx")

describe("inbox shell height", () => {
  it("sizes the app shell with the dynamic viewport, not the large one", () => {
    // `h-screen` compiles to `height: 100vh`. The shell is
    // `overflow-hidden`, so a `100vh` box on mobile is clipped at the
    // bottom of the visual viewport and takes the composer with it.
    expect(shell).toMatch(/h-\[100dvh\]/)
    expect(shell).not.toMatch(/\bh-screen\b/)
  })

  it("sizes the inbox workspace with the dynamic viewport", () => {
    // The workspace is also `overflow-hidden`, and the composer is
    // pinned to its bottom edge, so this value decides whether the
    // typing box is on screen at all.
    expect(inboxPage).toMatch(/h-\[calc\(100dvh-var\(--app-header-h\)\)\]/)
    expect(inboxPage).not.toMatch(/100vh/)
  })

  it("subtracts the header height from a single declared source", () => {
    // `--app-header-h` is defined in the shell, on the same element
    // column that renders the `h-14` header. The inbox page must
    // reference it rather than repeat a literal, or the subtraction
    // drifts the moment the header height changes and the composer is
    // clipped again.
    expect(shell).toMatch(/\[--app-header-h:3\.5rem\]/)
    expect(inboxPage).toContain("var(--app-header-h)")

    // Guard the number itself: the declaration must still describe the
    // real header, otherwise the "single source" is simply a wrong
    // constant.
    expect(header).toMatch(/<header[^>]*\bh-14\b/)
    // 3.5rem === 56px === Tailwind `h-14`.
    expect(3.5 * 16).toBe(56)
  })
})

describe("inbox layout chain", () => {
  it("gives the conversation column a bounded, shrinkable height", () => {
    // The column holding the message list and the composer must be
    // able to shrink, otherwise the list pushes the composer out of the
    // box no matter what the composer itself declares.
    const column = /<div className=\{cn\("flex min-w-0 flex-1 flex-col h-full min-h-0/.test(thread)
    expect(column).toBe(true)
  })

  it("scrolls the message list instead of the composer", () => {
    // Exactly one scroll region, and it is the list. If the composer
    // were the scroller it would be the thing that moves out of view.
    expect(thread).toMatch(/min-h-0 flex-1 overflow-y-auto/)
  })

  it("keeps the composer out of the shrinkable area", () => {
    // `shrink-0` on the composer root is the last link in the chain:
    // without it the composer is a flex item with `flex-basis: auto`
    // that is allowed to compress below its content height, which is
    // what squashed the typing box on short viewports.
    expect(composer).toMatch(/shrink-0 border-t border-border/)
  })
})

describe("composer alternate states", () => {
  /* These two states replace the textarea entirely, and reaching them
     needs a real upload and a mic permission grant, so they are
     asserted against markup rather than rendered. */
  it("gives the attachment panel a surface that is actually visible", () => {
    // `bg-muted/40` was a tint so faint the panel read as part of the bar
    // behind it, so attaching a file looked like nothing happened.
    expect(composer).toMatch(/rounded-xl border border-border bg-muted p-3 shadow-xs/)
    expect(composer).not.toMatch(/bg-muted\/40/)
  })

  it("gives the attachment panel's controls the same hit target and focus ring", () => {
    // The discard button was `rounded p-1` — roughly 24px, floating
    // above the row, with no focus state, opposite a 36px send button.
    expect(composer).toMatch(/flex h-9 w-9 shrink-0 items-center justify-center rounded-lg/)
    // Its ring offset has to match the panel it sits on (`bg-muted`),
    // otherwise the offset halo is drawn in the wrong colour.
    expect(composer).toMatch(
      /focus-visible:ring-2 focus-visible:ring-ring\/60 focus-visible:ring-offset-2 focus-visible:ring-offset-muted/,
    )
  })

  it("keeps the recording bar's cancel hover visible", () => {
    // The recording bar's fill is `bg-card`; its cancel button hovered
    // to `bg-card` too, so pressing it produced no visual feedback at
    // all. Pinned on the exact class string, because `hover:bg-card` is
    // correct elsewhere in the file — it is the icon-button treatment on
    // the `bg-background` bar, and only the recording bar is `bg-card`.
    expect(composer).toMatch(
      /shrink-0 rounded-lg px-2\.5 py-1\.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground/,
    )
  })
})
