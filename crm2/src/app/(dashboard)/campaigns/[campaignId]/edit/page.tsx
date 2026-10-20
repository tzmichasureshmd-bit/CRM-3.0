'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { hasTable } from '@/lib/db/schema'
import { reportError } from '@/lib/errors'
import { EmptyState, PageHeader, SetupRequired } from '@/components/shared'
import { CampaignForm } from '../../campaign-form'
import type { Campaign } from '../../campaign-shared'

export default function EditCampaignPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const router = useRouter()
  const { accountId, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [schemaOk, setSchemaOk] = useState<boolean | null>(null)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    hasTable(supabase, 'campaigns')
      .then((ok) => {
        if (cancelled) return
        setSchemaOk(ok)
        if (!ok) setLoading(false)
      })
      .catch((err) => {
        console.error('[EditCampaignPage] hasTable failed:', err)
        if (cancelled) return
        setSchemaOk(true)
      })
    return () => {
      cancelled = true
    }
  }, [authLoading, supabase])

  useEffect(() => {
    if (authLoading || schemaOk !== true) return
    if (!accountId || !campaignId) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', campaignId)
          .eq('account_id', accountId)
          .maybeSingle()
        if (error) throw error
        if (cancelled) return
        if (data) setCampaign(data as Campaign)
        else setNotFound(true)
      } catch (err) {
        if (!cancelled) {
          toast.error('Campaign could not be loaded', {
            description: reportError(
              err,
              'EditCampaignPage.load',
              'The campaign could not be loaded for editing.',
            ),
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, schemaOk, accountId, campaignId, supabase])

  const backLink = (
    <Link
      href={campaign ? `/campaigns/${campaign.id}` : '/campaigns'}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to campaign
    </Link>
  )

  if (schemaOk === false) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit campaign" description="Campaigns need the campaigns table first." />
        <SetupRequired
          feature="Campaigns"
          migration="077_crm20_stabilization.sql"
          missing="Table public.campaigns does not exist yet, so the campaign cannot be edited."
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

  if (loading || authLoading || schemaOk === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading campaign…</p>
      </div>
    )
  }

  if (notFound || !campaign) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Edit campaign" />
        <EmptyState
          icon={Pencil}
          title="Campaign not found"
          description="This campaign does not exist, or it belongs to another account."
          action={
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Back to campaigns
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Edit ${campaign.name}`}
        description="Changes are saved to the campaigns row for this account."
      />
      {backLink}
      <CampaignForm
        campaign={campaign}
        onSaved={(saved) => router.push(`/campaigns/${saved.id}`)}
      />
    </div>
  )
}
