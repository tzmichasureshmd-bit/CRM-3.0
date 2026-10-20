"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * `matchMedia` as a hook, shared by the surfaces that need to render a
 * DIFFERENT component tree at a breakpoint rather than merely restyle
 * one.
 *
 * Why not a CSS breakpoint: the automation config panel is a docked
 * column on desktop and a bottom sheet on mobile. Hiding one with
 * `hidden lg:block` would leave two copies of the same controlled form
 * in the DOM — duplicate `label[for]`, duplicate input ids, and
 * whichever copy is invisible still bound to the same state. Choosing
 * the shell in JS mounts exactly one of them.
 *
 * Built on `useSyncExternalStore` rather than `useState` + an effect.
 * The effect version has to write the current value into state on
 * mount, which is a cascading render by definition and — worse here —
 * renders the WRONG shell first: the panel would mount as a bottom
 * sheet on desktop and then swap to a docked column a frame later,
 * remounting the form and throwing away whatever was typed into it. A
 * store lets the first client render read the real value, and the
 * server snapshot keeps SSR matching it.
 */
export function useMatchMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        // Some test environments and older WebViews ship no
        // `matchMedia`. Returning no subscription leaves the value at
        // the mobile default, which is a working editor — throwing here
        // would take the whole builder down over a layout decision.
        return () => {}
      }
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia(query).matches
  }, [query])

  // `false` on the server: the mobile sheet is the shell that works
  // everywhere, so a no-JS or pre-hydration render is usable.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** The breakpoint the automation builder's config panel docks at: the
 *  same `lg` the layout uses for the canvas + panel split. */
export const DOCK_PANEL_QUERY = "(min-width: 1024px)"
