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

interface CompanyData {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
}

export function CompanySettings() {
  const t = useTranslations('Settings.company');
  const { accountId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<CompanyData | null>(null);

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase
      .from('accounts')
      .select('id, name, address, phone, website, industry')
      .eq('id', accountId)
      .single()
      .then(({ data }) => {
        setData(data ?? null);
        setLoading(false);
      });
  }, [accountId]);

  const handleSave = async () => {
    if (!data || !accountId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('accounts')
      .update({
        name: data.name,
        address: data.address,
        phone: data.phone,
        website: data.website,
        industry: data.industry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);

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
          <CardTitle className="text-sm font-medium">{t('details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('companyName')}</Label>
            <Input
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('industry')}</Label>
            <Input
              value={data.industry ?? ''}
              onChange={(e) => setData({ ...data, industry: e.target.value })}
              placeholder={t('industryPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('phone')}</Label>
            <Input
              value={data.phone ?? ''}
              onChange={(e) => setData({ ...data, phone: e.target.value })}
              placeholder={t('phonePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('website')}</Label>
            <Input
              value={data.website ?? ''}
              onChange={(e) => setData({ ...data, website: e.target.value })}
              placeholder={t('websitePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('address')}</Label>
            <Input
              value={data.address ?? ''}
              onChange={(e) => setData({ ...data, address: e.target.value })}
              placeholder={t('addressPlaceholder')}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
