'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { hasTable } from '@/lib/db/schema'
import { PageHeader, SetupRequired } from '@/components/shared'
import { CampaignForm } from '../campaign-form'

export default function NewCampaignPage() {
  const router = useRouter()
  const { loading: authLoading } = useAuth()
  const supabase = createClient()
  const [schemaOk, setSchemaOk] = useState<boolean | null>(null)

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    hasTable(supabase, 'campaigns')
      .then((ok) => {
        if (!cancelled) setSchemaOk(ok)
      })
      .catch((err) => {
        console.error('[NewCampaignPage] hasTable failed:', err)
        if (!cancelled) setSchemaOk(true)
      })
    return () => {
      cancelled = true
    }
  }, [authLoading, supabase])

  if (schemaOk === false) {
    return (
      <div className="space-y-6">
        <PageHeader title="New campaign" description="Campaigns need the campaigns table first." />
        <SetupRequired
          feature="Campaigns"
          migration="077_crm20_stabilization.sql"
          missing="Table public.campaigns does not exist yet, so a campaign cannot be saved."
        />
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to campaigns
        </Link>
      </div>
    )
  }

  if (schemaOk === null || authLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Checking campaign setup…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New campaign"
        description="Define the strategy once — audience, channels, offer and budget."
      />
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to campaigns
      </Link>
      <CampaignForm
        onSaved={(saved) => {
          router.push(`/campaigns/${saved.id}`)
        }}
      />
    </div>
  )
}
