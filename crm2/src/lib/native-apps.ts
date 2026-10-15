export type NativePlatformId = 'android' | 'windows';
export type DetectedPlatform = NativePlatformId | 'other';

export interface NativeDownload {
  id: NativePlatformId;
  /** Public path (served from `public/downloads/`). */
  path: string;
  /** Suggested file name for the browser download. */
  file: string;
}

export const NATIVE_DOWNLOADS: Record<NativePlatformId, NativeDownload> = {
  android: {
    id: 'android',
    path: '/downloads/Tzmicha-CRM.apk',
    file: 'Tzmicha-CRM.apk',
  },
  windows: {
    id: 'windows',
    path: '/downloads/Tzmicha-CRM-Setup.exe',
    file: 'Tzmicha-CRM-Setup.exe',
  },
};

export function detectNativePlatform(): DetectedPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  return 'other';
}

/**
 * Ordering for the install dialog: the visiting platform is shown first,
 * the other option stays visible right next to it. Never blocks anything.
 */
export function primaryDownloadOrder(): NativeDownload[] {
  const primary = detectNativePlatform();
  if (primary === 'windows') {
    return [NATIVE_DOWNLOADS.windows, NATIVE_DOWNLOADS.android];
  }
  return [NATIVE_DOWNLOADS.android, NATIVE_DOWNLOADS.windows];
}
