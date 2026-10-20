'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Layers } from 'lucide-react';
import { TemplateManager } from '@/components/settings/template-manager';

function TemplatesInner() {
  const searchParams = useSearchParams();
  // Deep-link support: /templates?new=1 opens the create dialog.
  const defaultNew = searchParams.get('new') === '1';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Layers className="h-6 w-6 text-primary" />
            WhatsApp Templates
          </h1>
          <p className="text-muted-foreground">
            Create and manage approved message templates for campaigns,
            broadcasts, the inbox and automations.
          </p>
        </div>
      </div>

      <TemplateManager defaultNew={defaultNew} />
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense>
      <TemplatesInner />
    </Suspense>
  );
}
