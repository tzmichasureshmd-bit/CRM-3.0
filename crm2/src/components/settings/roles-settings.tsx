'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';
import { Badge } from '@/components/ui/badge';
import { Crown, Shield, UserCog, User } from 'lucide-react';
import { ROLE_META } from './role-meta';
import type { AccountRole } from '@/lib/auth/roles';
import { useAuth } from '@/hooks/use-auth';

const ROLE_DESCRIPTIONS: Record<AccountRole, string> = {
  owner: 'Full access to all settings, billing, and account management. Can transfer ownership.',
  admin: 'Can manage team members, settings, and all workspace content.',
  agent: 'Can send messages, manage contacts, deals, and day-to-day operations.',
  viewer: 'Read-only access to view conversations, contacts, and reports.',
};

const ROLE_CAPABILITIES: Record<AccountRole, string[]> = {
  owner: ['Manage billing', 'Transfer ownership', 'Delete account', 'All admin permissions'],
  admin: ['Manage team members', 'Edit settings', 'Manage WhatsApp', 'Manage templates', 'Manage pipelines'],
  agent: ['Send messages', 'Create contacts', 'Manage deals', 'Run broadcasts', 'Edit automations'],
  viewer: ['View conversations', 'View contacts', 'View reports', 'View pipelines'],
};

export function RolesSettings() {
  const t = useTranslations('Settings.roles');
  const { accountRole } = useAuth();

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />
      <div className="grid gap-4">
        {(Object.keys(ROLE_META) as AccountRole[]).map((role) => {
          const meta = ROLE_META[role];
          const Icon = meta.icon;
          return (
            <Card key={role}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${meta.className}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      {t(`roles.${role}.title`)}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_DESCRIPTIONS[role]}
                    </p>
                  </div>
                  {accountRole === role && (
                    <Badge variant="outline" className="ml-auto text-xs">
                      {t('currentRole')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {ROLE_CAPABILITIES[role].map((cap) => (
                    <span
                      key={cap}
                      className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
