'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { reportError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AUDIENCE_FILTER_TYPES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  CHANNEL_OPTIONS,
  CUSTOM_FIELD_OPERATORS,
  campaignStatusLabel,
  campaignTypeLabel,
  parseCsvList,
  type Campaign,
  type CampaignAudienceType,
  type CampaignStatus,
  type CampaignType,
} from './campaign-shared'

interface FieldErrors {
  name?: string
  endDate?: string
  budget?: string
}

export interface CampaignFormProps {
  /**
   * When present the form saves an UPDATE instead of an INSERT. The
   * caller must only mount the form once the row has loaded, because
   * field state is seeded from this object on first render.
   */
  campaign?: Campaign | null
  /** Runs after the insert/update has resolved successfully. */
  onSaved: (campaign: Campaign) => void
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs font-medium text-destructive">{message}</p>
}

/**
 * Create/edit form for a campaign row. Shared by `/campaigns/new` and
 * `/campaigns/[campaignId]/edit`; validation, busy state and toasts
 * live here so both routes behave identically.
 */
export function CampaignForm({ campaign, onSaved }: CampaignFormProps) {
  const { accountId } = useAuth()
  const isEdit = Boolean(campaign)
  const tracking = campaign?.tracking ?? {}

  const [name, setName] = useState(campaign?.name ?? '')
  const [description, setDescription] = useState(campaign?.description ?? '')
  const [type, setType] = useState<CampaignType>(campaign?.type ?? 'lead_generation')
  const [objective, setObjective] = useState(campaign?.objective ?? '')
  const [status, setStatus] = useState<CampaignStatus>(campaign?.status ?? 'draft')

  const [audience, setAudience] = useState(campaign?.audience ?? '')
  const [filterType, setFilterType] = useState<CampaignAudienceType>(
    campaign?.audience_filter?.type ?? 'all',
  )
  const [tagIds, setTagIds] = useState((campaign?.audience_filter?.tagIds ?? []).join(', '))
  const [excludeTagIds, setExcludeTagIds] = useState(
    (campaign?.audience_filter?.excludeTagIds ?? []).join(', '),
  )
  const [contactIds, setContactIds] = useState(
    (campaign?.audience_filter?.contactIds ?? []).join(', '),
  )
  const [customFieldId, setCustomFieldId] = useState(
    campaign?.audience_filter?.customField?.fieldId ?? '',
  )
  const [customFieldOperator, setCustomFieldOperator] = useState<'is' | 'is_not' | 'contains'>(
    campaign?.audience_filter?.customField?.operator ?? 'is',
  )
  const [customFieldValue, setCustomFieldValue] = useState(
    campaign?.audience_filter?.customField?.value ?? '',
  )

  const [channels, setChannels] = useState<string[]>(campaign?.channels ?? [])
  const [startDate, setStartDate] = useState(campaign?.start_date ?? '')
  const [endDate, setEndDate] = useState(campaign?.end_date ?? '')
  const [budget, setBudget] = useState(
    campaign?.budget === null || campaign?.budget === undefined ? '' : String(campaign.budget),
  )
  const [currency, setCurrency] = useState(
    typeof tracking.currency === 'string' ? tracking.currency : '',
  )

  const [message, setMessage] = useState(campaign?.message ?? '')
  const [cta, setCta] = useState(campaign?.cta ?? '')
  const [landingPage, setLandingPage] = useState(campaign?.landing_page ?? '')
  const [offerTitle, setOfferTitle] = useState(campaign?.offer_title ?? '')
  const [offerSummary, setOfferSummary] = useState(campaign?.offer_summary ?? '')
  const [offerDiscount, setOfferDiscount] = useState(campaign?.offer_discount ?? '')
  const [offerValidUntil, setOfferValidUntil] = useState(campaign?.offer_valid_until ?? '')
  const [tags, setTags] = useState((campaign?.tags ?? []).join(', '))

  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!name.trim()) next.name = 'Name is required.'
    if (startDate && endDate && endDate < startDate) {
      next.endDate = 'End date must be on or after the start date.'
    }
    if (budget.trim()) {
      const amount = Number(budget)
      if (!Number.isFinite(amount)) next.budget = 'Budget must be a number.'
      else if (amount < 0) next.budget = 'Budget must be 0 or more.'
    }
    return next
  }

  function buildAudienceFilter(): Record<string, unknown> {
    const filter: Record<string, unknown> = { type: filterType }
    if (filterType === 'tags') {
      filter.tagIds = parseCsvList(tagIds)
      const excluded = parseCsvList(excludeTagIds)
      if (excluded.length > 0) filter.excludeTagIds = excluded
    } else if (filterType === 'contacts') {
      filter.contactIds = parseCsvList(contactIds)
    } else if (filterType === 'custom_field') {
      filter.customField = {
        fieldId: customFieldId.trim(),
        operator: customFieldOperator,
        value: customFieldValue,
      }
    }
    return filter
  }

  function buildTracking(): Record<string, unknown> {
    const next: Record<string, unknown> = { ...tracking }
    const code = currency.trim()
    if (code) next.currency = code.toUpperCase()
    else delete next.currency
    return next
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (!accountId) {
      toast.error('No account selected', {
        description: 'Pick an account before saving a campaign.',
      })
      return
    }

    setSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) {
        throw new Error('You are not signed in. Sign in again and retry.')
      }

      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        type,
        objective: objective.trim() || null,
        status,
        audience: audience.trim() || null,
        audience_filter: buildAudienceFilter(),
        channels,
        start_date: startDate || null,
        end_date: endDate || null,
        budget: budget.trim() === '' ? null : Number(budget),
        message: message.trim() || null,
        cta: cta.trim() || null,
        landing_page: landingPage.trim() || null,
        offer_title: offerTitle.trim() || null,
        offer_summary: offerSummary.trim() || null,
        offer_discount: offerDiscount.trim() || null,
        offer_valid_until: offerValidUntil || null,
        tags: parseCsvList(tags),
        tracking: buildTracking(),
      }

      let saved: Campaign | null = null

      if (isEdit && campaign) {
        const { data, error } = await supabase
          .from('campaigns')
          .update(payload)
          .eq('id', campaign.id)
          .eq('account_id', campaign.account_id)
          .select('*')
          .single()
        if (error) throw error
        saved = data as Campaign
        toast.success('Campaign updated', {
          description: `${saved.name} · ${campaignStatusLabel(saved.status)}`,
        })
      } else {
        const { data, error } = await supabase
          .from('campaigns')
          .insert({
            ...payload,
            account_id: accountId,
            created_by: user.id,
            owner_id: user.id,
          })
          .select('*')
          .single()
        if (error) throw error
        saved = data as Campaign
        toast.success('Campaign created', {
          description: `${saved.name} · ${campaignTypeLabel(saved.type)} · ${campaignStatusLabel(saved.status)}`,
        })
      }

      if (saved) onSaved(saved)
    } catch (err) {
      toast.error(isEdit ? 'Could not update campaign' : 'Could not create campaign', {
        description: reportError(
          err,
          'CampaignForm.save',
          isEdit
            ? 'The campaign update was rejected.'
            : 'The campaign could not be created.',
        ),
      })
    } finally {
      setSaving(false)
    }
  }

  function toggleChannel(channel: string, checked: boolean) {
    setChannels((prev) =>
      checked ? (prev.includes(channel) ? prev : [...prev, channel]) : prev.filter((c) => c !== channel),
    )
  }

  const cancelHref = campaign ? `/campaigns/${campaign.id}` : '/campaigns'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Section title="Campaign" description="What this campaign is and how it is tracked.">
        <div className="space-y-2">
          <Label htmlFor="campaign-name">Name *</Label>
          <Input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Diwali offer push"
            aria-invalid={Boolean(errors.name)}
            disabled={saving}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="campaign-description">Description</Label>
          <Textarea
            id="campaign-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Internal notes about this campaign"
            disabled={saving}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CampaignType)}>
              <SelectTrigger className="w-full" disabled={saving}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CampaignStatus)}>
              <SelectTrigger className="w-full" disabled={saving}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="campaign-objective">Objective</Label>
          <Textarea
            id="campaign-objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={2}
            placeholder="Generate 50 qualified leads from WhatsApp enquiries"
            disabled={saving}
          />
        </div>
      </Section>

      <Section
        title="Audience"
        description="Describe the audience in words, then build the reusable filter the broadcast composer will consume."
      >
        <div className="space-y-2">
          <Label htmlFor="campaign-audience">Audience description</Label>
          <Textarea
            id="campaign-audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            rows={2}
            placeholder="Existing customers in Mumbai who bought in the last 90 days"
            disabled={saving}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Audience filter</Label>
          <Select
            value={filterType}
            onValueChange={(v) => setFilterType(v as CampaignAudienceType)}
          >
            <SelectTrigger className="w-full sm:w-[280px]" disabled={saving}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCE_FILTER_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Saved as <code>audience_filter</code> so a broadcast created from this campaign can
            reuse the same targeting.
          </p>
        </div>

        {filterType === 'tags' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="campaign-tag-ids">Tag IDs</Label>
              <Input
                id="campaign-tag-ids"
                value={tagIds}
                onChange={(e) => setTagIds(e.target.value)}
                placeholder="tag-id-1, tag-id-2"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-exclude-tag-ids">Exclude tag IDs</Label>
              <Input
                id="campaign-exclude-tag-ids"
                value={excludeTagIds}
                onChange={(e) => setExcludeTagIds(e.target.value)}
                placeholder="tag-id-3"
                disabled={saving}
              />
            </div>
          </div>
        )}

        {filterType === 'contacts' && (
          <div className="space-y-2">
            <Label htmlFor="campaign-contact-ids">Contact IDs</Label>
            <Input
              id="campaign-contact-ids"
              value={contactIds}
              onChange={(e) => setContactIds(e.target.value)}
              placeholder="contact-id-1, contact-id-2"
              disabled={saving}
            />
          </div>
        )}

        {filterType === 'custom_field' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="campaign-custom-field">Custom field ID</Label>
              <Input
                id="campaign-custom-field"
                value={customFieldId}
                onChange={(e) => setCustomFieldId(e.target.value)}
                placeholder="city"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label>Operator</Label>
              <Select
                value={customFieldOperator}
                onValueChange={(v) => setCustomFieldOperator(v as 'is' | 'is_not' | 'contains')}
              >
                <SelectTrigger className="w-full" disabled={saving}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_FIELD_OPERATORS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-custom-value">Value</Label>
              <Input
                id="campaign-custom-value"
                value={customFieldValue}
                onChange={(e) => setCustomFieldValue(e.target.value)}
                placeholder="Mumbai"
                disabled={saving}
              />
            </div>
          </div>
        )}
      </Section>

      <Section title="Channels" description="Where this campaign will run.">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {CHANNEL_OPTIONS.map((channel) => (
            <label
              key={channel.value}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              <Checkbox
                checked={channels.includes(channel.value)}
                onCheckedChange={(checked) => toggleChannel(channel.value, checked === true)}
                disabled={saving}
              />
              {channel.label}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Schedule & budget" description="Dates, budget and the currency note.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="campaign-start">Start date</Label>
            <Input
              id="campaign-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign-end">End date</Label>
            <Input
              id="campaign-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-invalid={Boolean(errors.endDate)}
              disabled={saving}
            />
            <FieldError message={errors.endDate} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign-budget">Budget</Label>
            <Input
              id="campaign-budget"
              type="number"
              min={0}
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0.00"
              aria-invalid={Boolean(errors.budget)}
              disabled={saving}
            />
            <FieldError message={errors.budget} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-currency">Currency</Label>
          <Input
            id="campaign-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="USD"
            maxLength={3}
            className="sm:w-40"
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            There is no currency column — the code is stored inside the campaign&apos;s{' '}
            <code>tracking</code> JSON under the <code>currency</code> key.
          </p>
        </div>
      </Section>

      <Section title="Message & offer" description="What the customer sees.">
        <div className="space-y-2">
          <Label htmlFor="campaign-message">Message</Label>
          <Textarea
            id="campaign-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Festive season is here — shop the collection before stock runs out."
            disabled={saving}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="campaign-cta">Call to action</Label>
            <Input
              id="campaign-cta"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="Shop now"
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign-landing">Landing page</Label>
            <Input
              id="campaign-landing"
              type="url"
              value={landingPage}
              onChange={(e) => setLandingPage(e.target.value)}
              placeholder="https://example.com/diwali"
              disabled={saving}
            />
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="campaign-offer-title">Offer title</Label>
            <Input
              id="campaign-offer-title"
              value={offerTitle}
              onChange={(e) => setOfferTitle(e.target.value)}
              placeholder="Diwali Special Offer"
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign-offer-discount">Offer discount</Label>
            <Input
              id="campaign-offer-discount"
              value={offerDiscount}
              onChange={(e) => setOfferDiscount(e.target.value)}
              placeholder="20% OFF"
              disabled={saving}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-offer-summary">Offer summary</Label>
          <Textarea
            id="campaign-offer-summary"
            value={offerSummary}
            onChange={(e) => setOfferSummary(e.target.value)}
            rows={2}
            placeholder="20% off every order above ₹999, applied at checkout."
            disabled={saving}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="campaign-offer-valid">Offer valid until</Label>
            <Input
              id="campaign-offer-valid"
              type="date"
              value={offerValidUntil}
              onChange={(e) => setOfferValidUntil(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      </Section>

      <Section title="Tags" description="Labels for grouping campaigns in the list.">
        <div className="space-y-2">
          <Label htmlFor="campaign-tags">Tags</Label>
          <Input
            id="campaign-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="festive, q4, whatsapp"
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">Comma separated.</p>
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create campaign'}
        </Button>
        <Link
          href={cancelHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Cancel
        </Link>
      </div>
    </form>
  )
}
