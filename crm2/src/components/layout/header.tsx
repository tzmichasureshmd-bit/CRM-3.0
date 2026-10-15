'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  LogOut,
  Menu,
  Settings as SettingsIcon,
  User,
  Palette,
  Download,
} from 'lucide-react';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModeToggle } from '@/components/layout/mode-toggle';
import { ThemePanel } from '@/components/layout/theme-panel';
import { InstallAppDialog } from '@/components/layout/install-app-dialog';
import { usePwaInstall } from '@/hooks/use-pwa-install';

const pageTitles: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/inbox': 'inbox',
  '/notifications': 'notifications',
  '/contacts': 'contacts',
  '/crm': 'crm',
  '/pipelines': 'pipelines',
  '/campaigns': 'campaigns',
  '/broadcasts': 'broadcasts',
  '/templates': 'templates',
  '/presets': 'presetCampaigns',
  '/automations': 'automations',
  '/automations/flows': 'automationFlows',
  '/automations/bot-builder': 'botFlowBuilder',
  '/automations/followups': 'aiFollowups',
  '/automations/calls': 'bulkAiCalls',
  '/automations/quick-replies': 'quickReplies',
  '/automations/keyboard-triggers': 'keyboardTriggers',
  '/automations/appointments': 'appointments',
  '/automations/tickets': 'tickets',
  '/flows': 'flows',
  '/agents': 'aiAgents',
  '/reports': 'reports',
  '/billing': 'billing',
  '/settings': 'settings',
  '/media-library': 'mediaLibrary',
  '/api': 'apiDeveloper',
  '/save-money': 'saveMoney',
  '/integrations': 'integrations',
  '/tickets': 'tickets',
  '/social-media': 'socialMedia',
  '/guide': 'userGuide',
};

const sidebarScopedTitleKeys = new Set([
  'presetCampaigns',
  'automationFlows',
  'botFlowBuilder',
  'aiFollowups',
  'bulkAiCalls',
  'quickReplies',
  'keyboardTriggers',
  'appointments',
  'tickets',
  'saveMoney',
  'userGuide',
]);

type ResolvedPageTitle = { key: string } | { text: string };

function humanizePathname(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean).pop();
  if (!segment) return 'Dashboard';
  return segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function resolvePageTitle(pathname: string): ResolvedPageTitle {
  const exact = pageTitles[pathname];
  if (exact) return { key: exact };
  let bestKey = '';
  let bestLength = -1;
  for (const [path, key] of Object.entries(pageTitles)) {
    if (pathname.startsWith(`${path}/`) && path.length > bestLength) {
      bestKey = key;
      bestLength = path.length;
    }
  }
  if (bestKey) return { key: bestKey };
  return { text: humanizePathname(pathname) };
}

interface HeaderProps {
  /** Wired to the shell's drawer state. Used only on mobile — the
   *  hamburger button is hidden on lg+. */
  onOpenSidebar?: () => void;
}

import { useTranslations } from 'next-intl';

export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations('Header');
  const tSidebar = useTranslations('Sidebar');
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const { canInstall, isStandalone, install } = usePwaInstall();
  const resolvedTitle = resolvePageTitle(pathname);
  const title =
    'text' in resolvedTitle
      ? resolvedTitle.text
      : sidebarScopedTitleKeys.has(resolvedTitle.key)
        ? tSidebar(resolvedTitle.key)
        : t(resolvedTitle.key);
  const [themePanelOpen, setThemePanelOpen] = useState(false);

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    'U';

  return (
    <header className="border-border bg-background/80 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 backdrop-blur-lg lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Hamburger — mobile only. 44×44 hit target per Apple HIG. */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t('openMenu')}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-10 w-10 items-center justify-center rounded-md transition-colors lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-foreground truncate text-base font-semibold sm:text-lg">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <ModeToggle />

        {/* Real Android APK / Windows installer download */}
        <InstallAppDialog />

        {/* Zoho-style theme/appearance panel trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setThemePanelOpen((v) => !v)}
            aria-label="Appearance settings"
            title="Appearance"
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-10 w-10 items-center justify-center rounded-md transition-colors"
          >
            <Palette className="h-5 w-5" />
          </button>
          <ThemePanel
            open={themePanelOpen}
            onClose={() => setThemePanelOpen(false)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="hover:bg-muted/70 focus:bg-muted/70 data-popup-open:bg-muted/70 flex items-center gap-2 rounded-md px-1 py-1 transition-colors focus:outline-none sm:gap-3 sm:pr-3 sm:pl-1"
            aria-label={t('openAccountMenu')}
          >
            <Avatar className="size-8">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? t('defaultAvatar')}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="text-foreground hidden text-sm font-medium sm:inline">
              {profile?.full_name ?? t('defaultUser')}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="bg-popover text-popover-foreground ring-border min-w-56"
          >
            <div className="px-2 py-1.5">
              <p className="text-foreground truncate text-sm font-medium">
                {profile?.full_name ?? t('defaultUser')}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {profile?.email ?? ''}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=profile"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <User className="size-4" />
              {t('menuProfile')}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=whatsapp"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <SettingsIcon className="size-4" />
              {t('menuSettings')}
            </DropdownMenuItem>
            {canInstall && !isStandalone ? (
              <DropdownMenuItem
                onClick={() => {
                  void install();
                }}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <Download className="size-4" />
                {t('menuInstallApp')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={signOut}
              className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <LogOut className="size-4" />
              {t('menuSignOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
