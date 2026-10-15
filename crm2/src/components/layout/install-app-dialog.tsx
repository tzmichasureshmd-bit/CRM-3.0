'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AppWindow,
  ArrowDownToLine,
  CheckCircle2,
  Globe,
  Loader2,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNativeDownloads } from '@/hooks/use-native-downloads';
import {
  NATIVE_DOWNLOADS,
  primaryDownloadOrder,
  type NativePlatformId,
} from '@/lib/native-apps';
import { cn } from '@/lib/utils';

interface PlatformOption {
  id: NativePlatformId;
  icon: typeof Smartphone;
  tileClass: string;
  title: string;
  description: string;
  action: string;
}

function InstallAppDialogContent() {
  const t = useTranslations('InstallApp');
  const { availability, checking } = useNativeDownloads();

  const options: PlatformOption[] = [
    {
      id: 'android',
      icon: Smartphone,
      tileClass: 'from-violet-500 to-purple-600',
      title: t('androidTitle'),
      description: t('androidDescription'),
      action: t('androidAction'),
    },
    {
      id: 'windows',
      icon: Monitor,
      tileClass: 'from-sky-500 to-blue-600',
      title: t('windowsTitle'),
      description: t('windowsDescription'),
      action: t('windowsAction'),
    },
  ];

  const ordered = primaryDownloadOrder().map((download) =>
    options.find((o) => o.id === download.id)!
  );

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
            <AppWindow className="size-5" />
          </div>
          <div className="min-w-0 space-y-0.5 pt-0.5">
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="grid gap-3 pt-1 sm:grid-cols-2">
        {ordered.map((option) => {
          const available = availability[option.id];
          const Icon = option.icon;
          return (
            <div
              key={option.id}
              className={cn(
                'border-border bg-card relative flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-colors',
                available
                  ? 'border-primary/30 hover:border-primary/50'
                  : 'hover:border-border'
              )}
            >
              {available && !checking ? (
                <span className="absolute top-3 right-3 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-500">
                  <CheckCircle2 className="size-3.5" />
                  {t('ready')}
                </span>
              ) : null}

              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm',
                    option.tileClass
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <h3 className="text-foreground text-sm font-semibold">
                    {option.title}
                  </h3>
                  <p className="text-muted-foreground text-[13px] leading-snug">
                    {option.description}
                  </p>
                </div>
              </div>

              <div className="mt-auto pt-1">
                {checking ? (
                  <Button variant="default" className="w-full" disabled>
                    <Loader2 className="size-4 animate-spin" />
                    {t('checking')}
                  </Button>
                ) : available ? (
                  <Button
                    render={
                      <a
                        href={NATIVE_DOWNLOADS[option.id].path}
                        download={NATIVE_DOWNLOADS[option.id].file}
                      />
                    }
                    variant="default"
                    className="w-full"
                  >
                    <ArrowDownToLine data-icon="inline-start" />
                    {option.action}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    {t('unavailable')}
                  </Button>
                )}
                {!checking && !available ? (
                  <p className="text-muted-foreground mt-1.5 text-center text-xs">
                    {t('unavailableHint')}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-border text-muted-foreground flex items-center justify-center gap-1.5 border-t pt-3 text-xs">
        <Globe className="size-3.5 shrink-0" />
        <span>{t('webFallback')}</span>
        <Link
          href="/settings?tab=app"
          className="text-primary inline-flex items-center font-medium underline-offset-4 hover:underline"
        >
          {t('webFallbackLink')}
        </Link>
      </div>
    </>
  );
}

/**
 * Header "Install App" entry point — a premium dialog offering the real
 * Android APK and Windows installer downloads. The visiting platform's
 * option is shown first; both stay visible regardless.
 */
export function InstallAppDialog() {
  const headerT = useTranslations('Header');
  const [open, setOpen] = useState(false);
  const { refresh } = useNativeDownloads();

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={headerT('headerInstallApp')}
        title={headerT('headerInstallApp')}
        className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-10 w-10 items-center justify-center rounded-md transition-colors"
      >
        <AppWindow className="h-5 w-5" />
      </button>
      <DialogContent className="sm:max-w-md">
        <InstallAppDialogContent />
      </DialogContent>
    </Dialog>
  );
}
