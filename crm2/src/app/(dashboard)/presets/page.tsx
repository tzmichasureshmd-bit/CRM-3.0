'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import type { PresetCampaign } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Plus, Search, Loader2, FileText, Copy, Trash2, Pencil, ToggleLeft, ToggleRight, Rocket,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const PRESET_CATEGORIES = ['general', 'marketing', 'promotion', 'follow-up', 'onboarding', 'other'] as const

export default function PresetsPage() {
  const { accountId } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [presets, setPresets] = useState<PresetCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [total, setTotal] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    category: 'general',
    description: '',
    template_name: '',
    template_language: 'en_US',
    template_variables: '{}',
    audience_filter: '{}',
  })

  const loadPresets = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    try {
      let query = supabase
        .from('preset_campaigns')
        .select('*', { count: 'exact' })
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })

      if (categoryFilter !== 'all') query = query.eq('category', categoryFilter)
      if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
      query = query.range(0, 49)

      const { data, error, count } = await query
      if (error) throw error
      setPresets((data ?? []) as PresetCampaign[])
      setTotal(count ?? 0)
    } catch (err) {
      console.error('[PresetsPage] loadPresets:', err)
      toast.error('Failed to load presets')
    } finally {
      setLoading(false)
    }
  }, [accountId, supabase, categoryFilter, search])

  useEffect(() => { loadPresets() }, [loadPresets])

  function openCreate() {
    setEditingId(null)
    setForm({ name: '', category: 'general', description: '', template_name: '', template_language: 'en_US', template_variables: '{}', audience_filter: '{}' })
    setDialogOpen(true)
  }

  function openEdit(preset: PresetCampaign) {
    setEditingId(preset.id)
    setForm({
      name: preset.name,
      category: preset.category,
      description: preset.description ?? '',
      template_name: preset.template_name,
      template_language: preset.template_language,
      template_variables: JSON.stringify(preset.template_variables ?? {}, null, 2),
      audience_filter: JSON.stringify(preset.audience_filter ?? {}, null, 2),
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!accountId) return
    if (!form.name.trim() || !form.template_name.trim()) {
      toast.error('Name and template name are required')
      return
    }
    setSaving(true)
    try {
      let parsedVars: Record<string, unknown> = {}
      let parsedAudience: Record<string, unknown> = {}
      try { parsedVars = JSON.parse(form.template_variables || '{}') } catch { /* keep {} */ }
      try { parsedAudience = JSON.parse(form.audience_filter || '{}') } catch { /* keep {} */ }

      const payload = {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || null,
        template_name: form.template_name.trim(),
        template_language: form.template_language,
        template_variables: parsedVars,
        audience_filter: parsedAudience,
      }

      if (editingId) {
        const { error } = await supabase
          .from('preset_campaigns')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId)
          .eq('account_id', accountId)
        if (error) throw error
        toast.success('Preset updated')
      } else {
        const { error } = await supabase
          .from('preset_campaigns')
          .insert({ account_id: accountId, ...payload })
        if (error) throw error
        toast.success('Preset created')
      }
      setDialogOpen(false)
      await loadPresets()
    } catch (err) {
      console.error('[PresetsPage] handleSave:', err)
      toast.error(editingId ? 'Failed to update preset' : 'Failed to create preset')
    } finally {
      setSaving(false)
    }
  }

  async function handleDuplicate(preset: PresetCampaign) {
    if (!accountId) return
    try {
      const { error } = await supabase
        .from('preset_campaigns')
        .insert({
          account_id: accountId,
          name: `Copy of ${preset.name}`.slice(0, 255),
          category: preset.category,
          description: preset.description,
          template_name: preset.template_name,
          template_language: preset.template_language,
          template_variables: preset.template_variables,
          audience_filter: preset.audience_filter,
          header_media_url: preset.header_media_url,
        })
      if (error) throw error
      toast.success('Preset duplicated')
      await loadPresets()
    } catch (err) {
      console.error('[PresetsPage] handleDuplicate:', err)
      toast.error('Failed to duplicate preset')
    }
  }

  async function handleToggleActive(preset: PresetCampaign) {
    if (!accountId) return
    try {
      const { error } = await supabase
        .from('preset_campaigns')
        .update({ is_active: !preset.is_active, updated_at: new Date().toISOString() })
        .eq('id', preset.id)
        .eq('account_id', accountId)
      if (error) throw error
      setPresets((prev) => prev.map((p) => p.id === preset.id ? { ...p, is_active: !p.is_active } : p))
      toast.success(preset.is_active ? 'Preset deactivated' : 'Preset activated')
    } catch (err) {
      console.error('[PresetsPage] handleToggleActive:', err)
      toast.error('Failed to update preset')
    }
  }

  async function handleDelete(preset: PresetCampaign) {
    if (!accountId) return
    try {
      const { error } = await supabase
        .from('preset_campaigns')
        .delete()
        .eq('id', preset.id)
        .eq('account_id', accountId)
      if (error) throw error
      setPresets((prev) => prev.filter((p) => p.id !== preset.id))
      setTotal((prev) => Math.max(0, prev - 1))
      toast.success('Preset deleted')
    } catch (err) {
      console.error('[PresetsPage] handleDelete:', err)
      toast.error('Failed to delete preset')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Preset Campaigns</h1>
          <p className="text-sm text-muted-foreground">Reusable campaign templates you can launch with one click.</p>
          {!loading && total > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{total} {total === 1 ? 'preset' : 'presets'}</p>
          )}
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New Preset
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search presets…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {PRESET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : presets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <FileText className="h-8 w-8" />
              <p className="text-sm">{search.trim() || categoryFilter !== 'all' ? 'No presets match your filters.' : 'No presets yet.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {presets.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{p.category}</Badge>
                      {!p.is_active && <Badge variant="outline" className="text-[10px] opacity-60">Inactive</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Template: {p.template_name} {p.description ? `— ${p.description}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs gap-1"
                      onClick={() => router.push(`/broadcasts/new?preset=${p.id}`)}
                    >
                      <Rocket className="h-3.5 w-3.5" />
                      Use
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDuplicate(p)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleToggleActive(p)}>
                      {p.is_active ? <ToggleRight className="h-3.5 w-3.5 text-green-500" /> : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Preset' : 'Create Preset'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update this reusable campaign template.' : 'Define a reusable campaign template.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekly Promo" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v ?? 'general' }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESET_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Template Name *</Label>
                <Input value={form.template_name} onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))} placeholder="template_name" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Optional description…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Template Variables (JSON)</Label>
              <Textarea value={form.template_variables} onChange={(e) => setForm((f) => ({ ...f, template_variables: e.target.value }))} rows={3} className="font-mono text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Audience Filter (JSON)</Label>
              <Textarea value={form.audience_filter} onChange={(e) => setForm((f) => ({ ...f, audience_filter: e.target.value }))} rows={3} className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? 'Save Changes' : 'Create Preset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
