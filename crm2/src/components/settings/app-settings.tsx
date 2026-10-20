'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { CloudOff, ShieldCheck } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InstallAppButton } from '@/components/pwa/install-app-button';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { SettingsPanelHead } from './settings-panel-head';

/**
 * "App & install" — installs Tzmicha CRM on this device, shows install
 * state, and explains the offline/privacy model. Static UI only: it never
 * touches the database.
 */
export function AppSettings() {
  const t = useTranslations('Settings.app');
  const { canInstall, isStandalone, isIos } = usePwaInstall();

  return (
    <div className="space-y-6">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <Image
            src="/icons/icon-192x192.png"
            alt="Tzmicha CRM"
            width={64}
            height={64}
            unoptimized
            className="size-16 shrink-0 rounded-2xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Tzmicha CRM</CardTitle>
              {isStandalone ? <Badge>{t('installed')}</Badge> : null}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('installCardDesc')}
            </p>
          </div>
          {!isStandalone && !isIos ? <InstallAppButton size="lg" /> : null}
        </CardContent>
      </Card>

      {isIos && !isStandalone ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t('iosTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{t('iosHint')}</p>
          </CardContent>
        </Card>
      ) : null}

      {!isStandalone && !canInstall && !isIos ? (
        <Card>
          <CardContent className="text-muted-foreground text-sm">
            {t('notInstallable')}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <CloudOff className="size-4" />
            {t('offlineTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t('offlineDesc')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4" />
            {t('privacyTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t('privacyDesc')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
