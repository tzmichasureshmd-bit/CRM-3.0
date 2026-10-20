"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, DollarSign, Pencil, RefreshCw, Search, Tag } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { PricingRule } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type PricingRuleRow = PricingRule & { accounts?: { name: string } | null }

const CATEGORY_COLORS: Record<string, string> = {
  marketing: "bg-blue-500/10 text-blue-600",
  utility: "bg-emerald-500/10 text-emerald-600",
  authentication: "bg-purple-500/10 text-purple-600",
}

export default function PricingRulesPage() {
  const [rules, setRules] = useState<PricingRuleRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [editRule, setEditRule] = useState<PricingRuleRow | null>(null)
  const [editRate, setEditRate] = useState("")
  const [editActive, setEditActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newRule, setNewRule] = useState({ category: "marketing" as string, destination: "", rate_cents: "", currency: "USD", description: "" })

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error: qErr } = await supabase
        .from("pricing_rules")
        .select("*, accounts(name)")
        .order("category", { ascending: true })
      if (qErr) throw qErr
      setRules((data ?? []) as PricingRuleRow[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pricing rules")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveEdit() {
    if (!editRule || !editRate) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const cents = Math.round(parseFloat(editRate) * 100)
      const { error: uErr } = await supabase
        .from("pricing_rules")
        .update({ rate_cents: cents, is_active: editActive, updated_at: new Date().toISOString() })
        .eq("id", editRule.id)
      if (uErr) throw uErr
      setEditRule(null)
      load()
    } catch {
      // user can retry
    } finally {
      setSubmitting(false)
    }
  }

  async function createRule() {
    if (!newRule.destination || !newRule.rate_cents) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const cents = Math.round(parseFloat(newRule.rate_cents) * 100)
      const { error: iErr } = await supabase.from("pricing_rules").insert({
        account_id: "00000000-0000-0000-0000-000000000000",
        category: newRule.category,
        destination: newRule.destination,
        rate_cents: cents,
        currency: newRule.currency,
        description: newRule.description || null,
        is_active: true,
      })
      if (iErr) throw iErr
      setShowNew(false)
      setNewRule({ category: "marketing", destination: "", rate_cents: "", currency: "USD", description: "" })
      load()
    } catch {
      // user can retry
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(rule: PricingRuleRow, next: boolean) {
    setRules((prev) => prev?.map((r) => r.id === rule.id ? { ...r, is_active: next } : r) ?? prev)
    const supabase = createClient()
    const { error } = await supabase
      .from("pricing_rules")
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq("id", rule.id)
    if (error) {
      setRules((prev) => prev?.map((r) => r.id === rule.id ? { ...r, is_active: !next } : r) ?? prev)
    }
  }

  const filtered = rules?.filter((r) => {
    if (!search) return true
    const name = (r.accounts as { name: string } | null)?.name ?? ""
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      r.destination.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase())
    )
  })

  const categories = rules ? [...new Set(rules.map((r) => r.category))] : []
  const accountsWithCustom = rules ? new Set(rules.map((r) => r.account_id)).size : 0

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  if (!rules) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Pricing Rules</h2>
          <p className="text-muted-foreground">Manage message rates across all accounts and categories.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Tag className="mr-2 h-4 w-4" /> Add Rule
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{rules.length}</p>
            <p className="text-xs text-muted-foreground">{categories.length} categories</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Accounts with Custom Rates</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{accountsWithCustom}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{rules.filter((r) => r.is_active).length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">All Pricing Rules</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search account, category..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No pricing rules found.
                  </TableCell>
                </TableRow>
              )}
              {filtered?.map((r) => {
                const name = (r.accounts as { name: string } | null)?.name ?? "—"
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${CATEGORY_COLORS[r.category] ?? "bg-muted text-muted-foreground"}`}>
                        {r.category}
                      </span>
                    </TableCell>
                    <TableCell>{r.destination}</TableCell>
                    <TableCell className="tabular-nums">${(r.rate_cents / 100).toFixed(4)}</TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(v) => toggleActive(r, !!v)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditRule(r)
                          setEditRate((r.rate_cents / 100).toFixed(4))
                          setEditActive(r.is_active)
                        }}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editRule} onOpenChange={(v) => !v && setEditRule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pricing Rule</DialogTitle>
            <DialogDescription>
              {editRule?.category} — {editRule?.destination}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-rate">Rate ($)</Label>
              <Input
                id="edit-rate"
                type="number"
                step="0.0001"
                min="0"
                value={editRate}
                onChange={(e) => setEditRate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Label>Active</Label>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRule(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={saveEdit} disabled={submitting || !editRate}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNew} onOpenChange={(v) => !v && setShowNew(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Pricing Rule</DialogTitle>
            <DialogDescription>Add a new default pricing rule for a category and destination.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                value={newRule.category}
                onChange={(e) => setNewRule((p) => ({ ...p, category: e.target.value }))}
              >
                <option value="marketing">Marketing</option>
                <option value="utility">Utility</option>
                <option value="authentication">Authentication</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-dest">Destination</Label>
              <Input
                id="new-dest"
                placeholder="e.g. US, IN, GB"
                value={newRule.destination}
                onChange={(e) => setNewRule((p) => ({ ...p, destination: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-rate">Rate ($)</Label>
              <Input
                id="new-rate"
                type="number"
                step="0.0001"
                min="0"
                placeholder="0.0000"
                value={newRule.rate_cents}
                onChange={(e) => setNewRule((p) => ({ ...p, rate_cents: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-currency">Currency</Label>
              <Input
                id="new-currency"
                value={newRule.currency}
                onChange={(e) => setNewRule((p) => ({ ...p, currency: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-desc">Description (optional)</Label>
              <Input
                id="new-desc"
                placeholder="e.g. Default US marketing rate"
                value={newRule.description}
                onChange={(e) => setNewRule((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={createRule} disabled={submitting || !newRule.destination || !newRule.rate_cents}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
