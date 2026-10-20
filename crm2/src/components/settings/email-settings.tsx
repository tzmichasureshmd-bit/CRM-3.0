'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { SettingsPanelHead } from './settings-panel-head';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

interface EmailConfigData {
  id: string;
  provider: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password: string | null;
  smtp_secure: boolean;
  from_email: string;
  from_name: string;
  enabled: boolean;
}

export function EmailSettings() {
  const t = useTranslations('Settings.email');
  const { accountId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<EmailConfigData | null>(null);

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase
      .from('email_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()
      .then(({ data }) => {
        setData(
          data ?? {
            id: '',
            provider: 'smtp',
            smtp_host: '',
            smtp_port: 587,
            smtp_username: '',
            smtp_password: '',
            smtp_secure: true,
            from_email: '',
            from_name: '',
            enabled: false,
          },
        );
        setLoading(false);
      });
  }, [accountId]);

  const handleSave = async () => {
    if (!data || !accountId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('email_config')
      .upsert({
        account_id: accountId,
        provider: data.provider,
        smtp_host: data.smtp_host,
        smtp_port: data.smtp_port,
        smtp_username: data.smtp_username,
        smtp_password: data.smtp_password,
        smtp_secure: data.smtp_secure,
        from_email: data.from_email,
        from_name: data.from_name,
        enabled: data.enabled,
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
          <CardTitle className="text-sm font-medium">{t('smtpConfig')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t('enableEmail')}</Label>
              <p className="text-xs text-muted-foreground">{t('enableEmailDesc')}</p>
            </div>
            <Switch
              checked={data.enabled}
              onCheckedChange={(checked) => setData({ ...data, enabled: checked })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('smtpHost')}</Label>
            <Input
              value={data.smtp_host ?? ''}
              onChange={(e) => setData({ ...data, smtp_host: e.target.value })}
              placeholder="smtp.example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('smtpPort')}</Label>
              <Input
                type="number"
                value={data.smtp_port ?? 587}
                onChange={(e) => setData({ ...data, smtp_port: parseInt(e.target.value) || 587 })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('smtpSecure')}</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={data.smtp_secure}
                  onCheckedChange={(checked) => setData({ ...data, smtp_secure: checked })}
                />
                <span className="text-xs text-muted-foreground">
                  {data.smtp_secure ? 'TLS' : 'None'}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('smtpUsername')}</Label>
            <Input
              value={data.smtp_username ?? ''}
              onChange={(e) => setData({ ...data, smtp_username: e.target.value })}
              placeholder="user@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('smtpPassword')}</Label>
            <Input
              type="password"
              value={data.smtp_password ?? ''}
              onChange={(e) => setData({ ...data, smtp_password: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('fromAddress')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('fromName')}</Label>
            <Input
              value={data.from_name}
              onChange={(e) => setData({ ...data, from_name: e.target.value })}
              placeholder="Your Company"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('fromEmail')}</Label>
            <Input
              type="email"
              value={data.from_email}
              onChange={(e) => setData({ ...data, from_email: e.target.value })}
              placeholder="noreply@yourcompany.com"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
