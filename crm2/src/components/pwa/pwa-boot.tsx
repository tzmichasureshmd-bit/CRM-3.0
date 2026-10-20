'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { captureInstallPrompt } from '@/hooks/use-pwa-install';

/**
 * Mounted once from the root layout. Registers the service worker (scoped
 * to the app, never caching updates) and captures the browser install
 * prompt as early as possible. Shows a "new version available" toast when
 * a background update lands — never on the very first install.
 *
 * `useTranslations` returns a stable function, so `t` is safe to use
 * inside the effect with `[t]` dependencies without re-registering.
 */
export function PwaBoot() {
  const t = useTranslations('Settings.app');

  useEffect(() => {
    captureInstallPrompt();

    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          registration.onupdatefound = () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.onstatechange = () => {
              if (newWorker.state !== 'installed') return;
              // A controller means this is a background update on an
              // already-running app — not the initial registration.
              if (!navigator.serviceWorker.controller) return;
              toast(t('updateTitle'), {
                description: t('updateDesc'),
                action: {
                  label: t('updateAction'),
                  onClick: () => window.location.reload(),
                },
              });
            };
          };
        })
        .catch(() => {
          // Progressive enhancement — ignore registration failures.
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, [t]);

  return null;
}
