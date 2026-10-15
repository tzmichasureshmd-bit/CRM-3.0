'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/hooks/use-pwa-install';

interface InstallAppButtonProps {
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?:
    'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
  className?: string;
}

/**
 * Triggers the real browser install flow. Renders nothing when the app
 * is already installed, when the browser has no install prompt (iOS) or
 * when the current page cannot be installed.
 */
export function InstallAppButton({
  size = 'default',
  variant = 'default',
  className,
}: InstallAppButtonProps) {
  const t = useTranslations('Settings.app');
  const { canInstall, isStandalone, install } = usePwaInstall();
  const [installing, setInstalling] = useState(false);

  if (!canInstall || isStandalone) return null;

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={installing}
      onClick={async () => {
        setInstalling(true);
        try {
          await install();
        } finally {
          setInstalling(false);
        }
      }}
    >
      <Download data-slot="icon" />
      {installing ? t('installing') : t('installButton')}
    </Button>
  );
}
