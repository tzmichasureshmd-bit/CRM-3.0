'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TrendingUp, Users } from 'lucide-react';
import { PipelinesTab } from '@/components/pipelines/PipelinesTab';
import { CrmTab } from '@/components/crm/CrmTab';

function PipelineCrmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'pipeline' | 'crm'>('pipeline');

  useEffect(() => {
    if (tabParam === 'crm' || tabParam === 'pipeline') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (tab: 'pipeline' | 'crm') => {
    setActiveTab(tab);
    router.replace(`/pipeline-crm?tab=${tab}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Page Header */}
      <div className="crm-page-header">
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 750,
              color: 'var(--crm-text)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Pipeline & CRM
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>
            {activeTab === 'pipeline'
              ? 'Manage active deals, stages, and sales pipeline'
              : 'Track contacts, lead progression, and CRM lifecycle'}
          </p>
        </div>

        {/* Segmented Tab Switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.65)',
            padding: 4,
            borderRadius: 14,
            border: '1px solid rgba(130, 145, 190, 0.22)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            gap: 4,
          }}
        >
          <button
            onClick={() => handleTabChange('pipeline')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: activeTab === 'pipeline' ? 700 : 600,
              border: 'none',
              cursor: 'pointer',
              background:
                activeTab === 'pipeline'
                  ? 'linear-gradient(135deg, #4f6df5, #8b5cf6)'
                  : 'transparent',
              color: activeTab === 'pipeline' ? '#ffffff' : 'var(--crm-text-secondary)',
              boxShadow:
                activeTab === 'pipeline'
                  ? '0 4px 14px rgba(79, 109, 245, 0.28)'
                  : 'none',
              transition: 'all 150ms ease',
            }}
          >
            <TrendingUp size={15} strokeWidth={activeTab === 'pipeline' ? 2.2 : 1.8} />
            <span>Pipeline</span>
          </button>

          <button
            onClick={() => handleTabChange('crm')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: activeTab === 'crm' ? 700 : 600,
              border: 'none',
              cursor: 'pointer',
              background:
                activeTab === 'crm'
                  ? 'linear-gradient(135deg, #4f6df5, #8b5cf6)'
                  : 'transparent',
              color: activeTab === 'crm' ? '#ffffff' : 'var(--crm-text-secondary)',
              boxShadow:
                activeTab === 'crm'
                  ? '0 4px 14px rgba(79, 109, 245, 0.28)'
                  : 'none',
              transition: 'all 150ms ease',
            }}
          >
            <Users size={15} strokeWidth={activeTab === 'crm' ? 2.2 : 1.8} />
            <span>CRM</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === 'pipeline' ? <PipelinesTab /> : <CrmTab />}
      </div>
    </div>
  );
}

export default function PipelineCrmPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: 'var(--crm-text-muted)' }}>Loading Pipeline & CRM...</div>}>
      <PipelineCrmContent />
    </Suspense>
  );
}
