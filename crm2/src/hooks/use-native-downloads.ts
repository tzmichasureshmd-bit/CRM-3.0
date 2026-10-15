'use client';

import { useCallback, useEffect, useState } from 'react';

import { NATIVE_DOWNLOADS, type NativePlatformId } from '@/lib/native-apps';

export type DownloadAvailability = Record<NativePlatformId, boolean>;

const EMPTY: DownloadAvailability = { android: false, windows: false };

/**
 * Probes the real download endpoints with HEAD requests so the UI never
 * pretends a file exists. Until the release artifacts are placed in
 * `public/downloads/` (see NATIVE_APPS.md) both options show as
 * "coming soon".
 */
export function useNativeDownloads() {
  const [availability, setAvailability] = useState<DownloadAvailability>(EMPTY);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    const next: DownloadAvailability = { android: false, windows: false };
    await Promise.all(
      Object.values(NATIVE_DOWNLOADS).map(async (download) => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(download.path, {
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal,
          });
          clearTimeout(timer);
          next[download.id] = response.ok;
        } catch {
          next[download.id] = false;
        }
      })
    );
    setAvailability(next);
    setChecking(false);
  }, []);

  useEffect(() => {
    // Deferred so the initial availability probe never triggers a
    // synchronous setState inside the effect (react-hooks/set-state-in-effect).
    setTimeout(() => {
      void refresh();
    }, 0);
  }, [refresh]);

  return { availability, checking, refresh };
}
