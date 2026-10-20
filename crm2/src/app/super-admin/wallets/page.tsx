"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, Wallet, Search, ArrowUpRight, ArrowDownLeft, RefreshCw, Eye } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { Wallet as WalletType, WalletTransaction } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
type WalletRow = WalletType & { accounts?: { name: string } | null }

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [adjustTarget, setAdjustTarget] = useState<WalletRow | null>(null)
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit")
  const [adjustAmount, setAdjustAmount] = useState("")
  const [adjustReason, setAdjustReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [historyTarget, setHistoryTarget] = useState<WalletRow | null>(null)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error: qErr } = await supabase
        .from("wallets")
        .select("*, accounts(name)")
        .order("created_at", { ascending: false })
      if (qErr) throw qErr
      setWallets((data ?? []) as WalletRow[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallets")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function submitAdjustment() {
    if (!adjustTarget || !adjustAmount || !adjustReason) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const cents = Math.round(parseFloat(adjustAmount) * 100)
      if (isNaN(cents) || cents <= 0) {
        setSubmitting(false)
        return
      }

      const delta = adjustType === "credit" ? cents : -cents
      const newBalance = adjustTarget.balance_cents + delta

      const { error: updateErr } = await supabase
        .from("wallets")
        .update({ balance_cents: newBalance, updated_at: new Date().toISOString() })
        .eq("id", adjustTarget.id)
      if (updateErr) throw updateErr

      await supabase.from("wallet_transactions").insert({
        account_id: adjustTarget.account_id,
        wallet_id: adjustTarget.id,
        type: "adjustment",
        amount_cents: delta,
        balance_before_cents: adjustTarget.balance_cents,
        balance_after_cents: newBalance,
        description: `[Super Admin] ${adjustReason}`,
        status: "completed",
        metadata: { adjusted_by: "super_admin" },
      })

      setAdjustTarget(null)
      setAdjustAmount("")
      setAdjustReason("")
      load()
    } catch {
      // silently fail — user can retry
    } finally {
      setSubmitting(false)
    }
  }

  async function openHistory(w: WalletRow) {
    setHistoryTarget(w)
    setLoadingHistory(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("wallet_id", w.id)
        .order("created_at", { ascending: false })
        .limit(50)
      setTransactions((data ?? []) as WalletTransaction[])
    } catch {
      setTransactions([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const filtered = wallets?.filter((w) => {
    if (!search) return true
    const name = (w.accounts as { name: string } | null)?.name ?? ""
    return name.toLowerCase().includes(search.toLowerCase())
  })

  const totalBalance = wallets?.reduce((s, w) => s + w.balance_cents, 0) ?? 0
  const totalReserved = wallets?.reduce((s, w) => s + w.reserved_cents, 0) ?? 0
  const totalUsed = wallets?.reduce((s, w) => s + w.used_cents, 0) ?? 0

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  if (!wallets) {
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
          <h2 className="text-2xl font-bold text-foreground">Wallet Management</h2>
          <p className="text-muted-foreground">View and adjust account wallets across all customers.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">${(totalBalance / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Reserved</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">${(totalReserved / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Used</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">${(totalUsed / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">All Wallets</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by account name..."
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
                <TableHead>Balance</TableHead>
                <TableHead>Reserved</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No wallets found.
                  </TableCell>
                </TableRow>
              )}
              {filtered?.map((w) => {
                const name = (w.accounts as { name: string } | null)?.name ?? "—"
                return (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="tabular-nums">${(w.balance_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="tabular-nums">${(w.reserved_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="tabular-nums">${(w.used_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{w.currency}</TableCell>
                    <TableCell>
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${w.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                        {w.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setAdjustTarget(w); setAdjustType("credit"); setAdjustAmount(""); setAdjustReason(""); }}>
                          <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> Credit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setAdjustTarget(w); setAdjustType("debit"); setAdjustAmount(""); setAdjustReason(""); }}>
                          <ArrowDownLeft className="mr-1 h-3.5 w-3.5" /> Debit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openHistory(w)}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> History
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!adjustTarget} onOpenChange={(v) => !v && setAdjustTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustType === "credit" ? "Credit" : "Debit"} Wallet
            </DialogTitle>
            <DialogDescription>
              Adjusting wallet for {(adjustTarget?.accounts as { name: string } | null)?.name ?? "Unknown Account"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button variant={adjustType === "credit" ? "default" : "outline"} size="sm" onClick={() => setAdjustType("credit")}>
                <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> Credit
              </Button>
              <Button variant={adjustType === "debit" ? "default" : "outline"} size="sm" onClick={() => setAdjustType("debit")}>
                <ArrowDownLeft className="mr-1 h-3.5 w-3.5" /> Debit
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-amount">Amount ($)</Label>
              <Input
                id="adjust-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-reason">Reason</Label>
              <Input
                id="adjust-reason"
                placeholder="e.g. Manual credit, billing correction"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjustTarget(null)} disabled={submitting}>Cancel</Button>
            <Button
              onClick={submitAdjustment}
              disabled={submitting || !adjustAmount || !adjustReason}
              variant={adjustType === "credit" ? "default" : "destructive"}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {adjustType === "credit" ? "Credit" : "Debit"} Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyTarget} onOpenChange={(v) => { if (!v) { setHistoryTarget(null); setTransactions([]) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Transaction History</DialogTitle>
            <DialogDescription>
              {(historyTarget?.accounts as { name: string } | null)?.name ?? "Unknown Account"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No transactions found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Before</TableHead>
                    <TableHead>After</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium capitalize">{t.type.replace(/_/g, " ")}</TableCell>
                      <TableCell className={t.amount_cents >= 0 ? "text-emerald-600" : "text-destructive"}>
                        {t.amount_cents >= 0 ? "+" : ""}{(t.amount_cents / 100).toFixed(2)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">${(t.balance_before_cents / 100).toFixed(2)}</TableCell>
                      <TableCell className="tabular-nums">${(t.balance_after_cents / 100).toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
