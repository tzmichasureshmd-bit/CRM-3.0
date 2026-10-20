'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { SettingsPanelHead } from './settings-panel-head';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface NotificationPrefsData {
  id: string;
  email_messages: boolean;
  email_broadcasts: boolean;
  email_automations: boolean;
  email_deals: boolean;
  push_messages: boolean;
  push_broadcasts: boolean;
  push_automations: boolean;
  push_deals: boolean;
}

export function NotificationSettings() {
  const t = useTranslations('Settings.notifications');
  const { user, accountId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<NotificationPrefsData | null>(null);

  useEffect(() => {
    if (!user || !accountId) return;
    const supabase = createClient();
    supabase
      .from('notification_preferences')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setData(
          data ?? {
            id: '',
            email_messages: true,
            email_broadcasts: true,
            email_automations: true,
            email_deals: true,
            push_messages: true,
            push_broadcasts: true,
            push_automations: true,
            push_deals: true,
          },
        );
        setLoading(false);
      });
  }, [user?.id, accountId]);

  const handleSave = async () => {
    if (!data || !user || !accountId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        account_id: accountId,
        user_id: user.id,
        email_messages: data.email_messages,
        email_broadcasts: data.email_broadcasts,
        email_automations: data.email_automations,
        email_deals: data.email_deals,
        push_messages: data.push_messages,
        push_broadcasts: data.push_broadcasts,
        push_automations: data.push_automations,
        push_deals: data.push_deals,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      toast.error(t('saveFailed'));
    } else {
      toast.success(t('saved'));
    }
    setSaving(false);
  };

  const toggle = (key: keyof NotificationPrefsData) => {
    if (!data) return;
    setData({ ...data, [key]: !data[key] });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t('loading')}
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t('noData')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('saveChanges')}
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('emailNotifications')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <NotificationRow
            label={t('messages')}
            description={t('messagesDesc')}
            checked={data.email_messages}
            onToggle={() => toggle('email_messages')}
          />
          <NotificationRow
            label={t('broadcasts')}
            description={t('broadcastsDesc')}
            checked={data.email_broadcasts}
            onToggle={() => toggle('email_broadcasts')}
          />
          <NotificationRow
            label={t('automations')}
            description={t('automationsDesc')}
            checked={data.email_automations}
            onToggle={() => toggle('email_automations')}
          />
          <NotificationRow
            label={t('deals')}
            description={t('dealsDesc')}
            checked={data.email_deals}
            onToggle={() => toggle('email_deals')}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('pushNotifications')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <NotificationRow
            label={t('messages')}
            description={t('messagesDesc')}
            checked={data.push_messages}
            onToggle={() => toggle('push_messages')}
          />
          <NotificationRow
            label={t('broadcasts')}
            description={t('broadcastsDesc')}
            checked={data.push_broadcasts}
            onToggle={() => toggle('push_broadcasts')}
          />
          <NotificationRow
            label={t('automations')}
            description={t('automationsDesc')}
            checked={data.push_automations}
            onToggle={() => toggle('push_automations')}
          />
          <NotificationRow
            label={t('deals')}
            description={t('dealsDesc')}
            checked={data.push_deals}
            onToggle={() => toggle('push_deals')}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationRow({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} />
    </div>
  );
}
