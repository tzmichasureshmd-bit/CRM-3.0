'use client';

import { useCallback, useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

/**
 * The browser fires one install prompt per session; if the early page is
 * the landing/login page it never reaches the Settings screen. We capture
 * the event at the module level from the root layout (PwaBoot) so it is
 * retained until the user actually wants to install.
 */
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let bound = false;

function notify() {
  for (const fn of listeners) fn();
}

/** Attach the browser install-prompt listeners exactly once per session. */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined' || bound) return;
  bound = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress the automatic mini-infobar; we trigger the prompt
    // explicitly from the in-app install button instead.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** True when the app is already open as an installed app (any platform). */
export function isStandaloneSession(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function subscribeToInstallState(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface PwaInstallState {
  /** True when the browser is offering a real install prompt and we are not
   * already running as an installed app. */
  canInstall: boolean;
  /** True when the app is already open as an installed (standalone) app. */
  isStandalone: boolean;
  /** True on iPhone/iPad — no programmatic install prompt exists there, the
   * user must use "Add to Home Screen" (instructions are shown instead). */
  isIos: boolean;
  /** Trigger the real browser install flow. Resolves true if accepted. */
  install: () => Promise<boolean>;
}

/** True on iPhone/iPad (including iPadOS, which reports `MacIntel`
 * with touch points instead of `iPad` in the user agent). */
function isIosBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ fakes a macOS desktop UA; real Macs have no touch points.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function usePwaInstall(): PwaInstallState {
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    captureInstallPrompt();
    const refresh = () => {
      setCanInstall(Boolean(deferred) && !isStandaloneSession());
      setIsStandalone(isStandaloneSession());
      setIsIos(isIosBrowser());
    };
    // Deferred so the server-rendered HTML hydrates unchanged first,
    // then the real install state surfaces on the next paint.
    const timer = window.setTimeout(refresh, 0);
    const unsubscribe = subscribeToInstallState(refresh);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const install = useCallback(async () => {
    const evt = deferred;
    if (!evt) return false;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    deferred = null;
    notify();
    return outcome === 'accepted';
  }, []);

  return { canInstall, isStandalone, isIos, install };
}
