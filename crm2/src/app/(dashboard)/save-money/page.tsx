"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  Calculator,
  Send,
  BarChart3,
  Loader2,
  Plus,
  TrendingUp,
  TrendingDown,
  FileText,
  MessageSquare,
  Zap,
  CheckCircle,
  AlertCircle,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from "lucide-react";
import type { ResourceUsage } from "@/types";

interface WalletRow {
  id: string;
  account_id: string;
  balance_cents: number;
  reserved_cents: number;
  used_cents: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface WalletTransaction {
  id: string;
  account_id: string;
  wallet_id: string;
  type: string;
  amount_cents: number;
  balance_before_cents: number;
  balance_after_cents: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

interface PricingRule {
  id: string;
  account_id: string;
  category: string;
  rate_cents: number;
  currency: string;
  destination: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MessageTemplate {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  category: string;
  language: string | null;
  header_type: string | null;
  header_content: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: unknown;
  status: string;
  meta_template_id: string | null;
  rejection_reason: string | null;
  quality_score: string | null;
  last_submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SmartBroadcast {
  id: string;
  account_id: string;
  user_id: string;
  name: string;
  template_id: string | null;
  template_category: string | null;
  status: string;
  audience_type: string;
  audience_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  estimated_cost_cents: number | null;
  actual_cost_cents: number | null;
  meta_category: string | null;
  error_message: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const TX_TYPE_KEYS = [
  "credit_purchase",
  "campaign_usage",
  "ai_usage",
  "voice_usage",
  "refund",
  "adjustment",
  "subscription_payment",
];

function txTypeBadgeClasses(type: string) {
  switch (type) {
    case "credit_purchase":
    case "refund":
    case "adjustment":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "campaign_usage":
    case "ai_usage":
    case "voice_usage":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "subscription_payment":
      return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function statusBadgeClasses(status: string) {
  switch (status) {
    case "approved":
    case "APPROVED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "pending":
    case "PENDING":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "rejected":
    case "REJECTED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "sent":
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "sending":
    case "scheduled":
      return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "failed":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TemplatesTab({
  templates,
  pricingRules,
  loading,
  currency,
}: {
  templates: MessageTemplate[];
  pricingRules: PricingRule[];
  loading: boolean;
  currency: string;
}) {
  const t = useTranslations("SaveMoney");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getRate = (category: string) => {
    const rule = pricingRules.find(
      (r) => r.category === category.toLowerCase() && r.is_active,
    );
    return rule?.rate_cents ?? 0;
  };

  const rejected = templates.filter(
    (t) => t.status === "REJECTED" || t.status === "Rejected",
  );

  return (
    <div className="space-y-4">
      {rejected.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t("templates.rejectedBanner", { count: rejected.length })}
            </p>
          </CardContent>
        </Card>
      )}

      {templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p className="text-sm">{t("templates.noTemplates")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("templates.colName")}</TableHead>
                <TableHead>{t("templates.colCategory")}</TableHead>
                <TableHead>{t("templates.colStatus")}</TableHead>
                <TableHead>{t("templates.colLanguage")}</TableHead>
                <TableHead>{t("templates.colEstCost")}</TableHead>
                <TableHead>{t("templates.colQuality")}</TableHead>
                <TableHead>{t("templates.colLastSubmitted")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((tpl) => {
                const rate = getRate(tpl.category);
                const isHighCost =
                  tpl.category.toLowerCase() === "marketing" && rate >= 1000;
                return (
                  <TableRow key={tpl.id}>
                    <TableCell className="font-medium">{tpl.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{tpl.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClasses(tpl.status)}`}
                      >
                        {tpl.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tpl.language ?? "en_US"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          isHighCost
                            ? "text-amber-600 dark:text-amber-400 font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {formatCurrency(rate / 100, currency)}
                        {isHighCost && <>{t("common.perMsg")}</>}
                      </span>
                    </TableCell>
                    <TableCell>
                      {tpl.quality_score ? (
                        <Badge
                          variant="outline"
                          className={
                            tpl.quality_score === "GREEN"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : tpl.quality_score === "RED"
                                ? "border-destructive/30 bg-destructive/10 text-destructive"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }
                        >
                          {tpl.quality_score}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          &mdash;
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tpl.last_submitted_at
                        ? formatDate(tpl.last_submitted_at)
                        : "\u2014"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CampaignsTab({
  broadcasts,
  loading,
  currency,
}: {
  broadcasts: SmartBroadcast[];
  loading: boolean;
  currency: string;
}) {
  const t = useTranslations("SaveMoney");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalCost = broadcasts.reduce(
    (s, b) => s + (b.actual_cost_cents ?? b.estimated_cost_cents ?? 0),
    0,
  );
  const totalSent = broadcasts.reduce((s, b) => s + b.sent_count, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">{t("campaigns.totalCampaigns")}</p>
            <p className="text-xl font-bold">{broadcasts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">{t("campaigns.totalSent")}</p>
            <p className="text-xl font-bold">{totalSent.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">{t("campaigns.totalCost")}</p>
            <p className="text-xl font-bold">
              {formatCurrency(totalCost / 100, currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {broadcasts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Send className="h-8 w-8" />
          <p className="text-sm">{t("campaigns.none")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("campaigns.colCampaign")}</TableHead>
                <TableHead>{t("campaigns.colStatus")}</TableHead>
                <TableHead>{t("campaigns.colAudience")}</TableHead>
                <TableHead>{t("campaigns.colSent")}</TableHead>
                <TableHead>{t("campaigns.colDelivered")}</TableHead>
                <TableHead>{t("campaigns.colFailed")}</TableHead>
                <TableHead>{t("campaigns.colEstCost")}</TableHead>
                <TableHead>{t("campaigns.colActualCost")}</TableHead>
                <TableHead>{t("campaigns.colCreated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClasses(b.status)}`}
                    >
                      {b.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {b.audience_type}
                  </TableCell>
                  <TableCell>{b.sent_count.toLocaleString()}</TableCell>
                  <TableCell>{b.delivered_count.toLocaleString()}</TableCell>
                  <TableCell>
                    {b.failed_count > 0 ? (
                      <span className="text-destructive font-medium">
                        {b.failed_count.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatCurrency(
                      (b.estimated_cost_cents ?? 0) / 100,
                      currency,
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(
                      (b.actual_cost_cents ?? 0) / 100,
                      currency,
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(b.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CostCalculatorTab({
  pricingRules,
  currency,
}: {
  pricingRules: PricingRule[];
  currency: string;
}) {
  const t = useTranslations("SaveMoney");
  const [recipients, setRecipients] = useState(1000);
  const [category, setCategory] = useState("marketing");

  const activeRules = useMemo(
    () => pricingRules.filter((r) => r.is_active),
    [pricingRules],
  );

  const matchedRule = useMemo(
    () => activeRules.find((r) => r.category === category) ?? null,
    [activeRules, category],
  );

  const metaRate = matchedRule?.rate_cents ?? 0;
  const metaCost = (metaRate * recipients) / 100;
  const serviceFee = metaCost * 0.15;
  const totalEstimate = metaCost + serviceFee;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            {t("calculator.title")}
          </CardTitle>
          <CardDescription>
            {t("calculator.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recipients">{t("calculator.recipients")}</Label>
              <Input
                id="recipients"
                type="number"
                min={1}
                value={recipients}
                onChange={(e) =>
                  setRecipients(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("calculator.category")}</Label>
              <Select value={category} onValueChange={(v) => { if (v != null) setCategory(v); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">{t("calculator.marketing")}</SelectItem>
                  <SelectItem value="utility">{t("calculator.utility")}</SelectItem>
                  <SelectItem value="authentication">{t("calculator.authentication")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {matchedRule ? (
            <p className="text-xs text-muted-foreground">
              {t("calculator.applicableRate", {
                rate: formatCurrency(metaRate / 100, currency),
                destination: matchedRule.destination,
              })}
            </p>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("calculator.noActiveRule")}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-xs text-muted-foreground">
                {t("calculator.estMetaCost")}
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatCurrency(metaCost, currency)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-xs text-muted-foreground">
                {t("calculator.serviceFee")}
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatCurrency(serviceFee, currency)}
              </p>
            </div>
            <div className="rounded-lg bg-primary/5 p-4 text-center ring-1 ring-primary/20">
              <p className="text-xs font-medium text-primary">
                {t("calculator.totalEstimate")}
              </p>
              <p className="mt-1 text-lg font-bold text-primary">
                {formatCurrency(totalEstimate, currency)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              {t("calculator.disclaimer")}
            </p>
          </div>
        </CardContent>
      </Card>

      {activeRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("calculator.activeRules")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("calculator.colCategory")}</TableHead>
                  <TableHead>{t("calculator.colRate")}</TableHead>
                  <TableHead>{t("calculator.colDestination")}</TableHead>
                  <TableHead>{t("calculator.colDescription")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium capitalize">
                      {rule.category}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(rule.rate_cents / 100, rule.currency)} {t("common.perMsg")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {rule.destination}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {rule.description ?? "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WalletTab({
  wallet,
  transactions,
  loading,
  currency,
  onAddFunds,
}: {
  wallet: WalletRow | null;
  transactions: WalletTransaction[];
  loading: boolean;
  currency: string;
  onAddFunds: () => void;
}) {
  const t = useTranslations("SaveMoney");

  const txTypeLabel = (type: string) =>
    TX_TYPE_KEYS.includes(type) ? t(`txTypes.${type}`) : type;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Wallet className="h-8 w-8" />
        <p className="text-sm">{t("wallet.none")}</p>
        <Button variant="outline" size="sm" onClick={onAddFunds}>
          <Plus className="mr-1 h-3 w-3" /> {t("wallet.init")}
        </Button>
      </div>
    );
  }

  const available = wallet.balance_cents - wallet.reserved_cents;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">{t("wallet.currentBalance")}</p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {formatCurrency(wallet.balance_cents / 100, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">{t("wallet.availableCredits")}</p>
            <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(available / 100, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">{t("wallet.reservedCredits")}</p>
            <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(wallet.reserved_cents / 100, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">{t("wallet.usedCredits")}</p>
            <p className="mt-1 text-xl font-bold text-muted-foreground">
              {formatCurrency(wallet.used_cents / 100, currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={onAddFunds}>
          <Plus className="mr-1 h-4 w-4" /> {t("wallet.addFunds")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("wallet.txHistory")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              {t("wallet.noTransactions")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("wallet.colDate")}</TableHead>
                    <TableHead>{t("wallet.colType")}</TableHead>
                    <TableHead>{t("wallet.colAmount")}</TableHead>
                    <TableHead>{t("wallet.colBalanceAfter")}</TableHead>
                    <TableHead>{t("wallet.colDescription")}</TableHead>
                    <TableHead>{t("wallet.colStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(tx.created_at)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${txTypeBadgeClasses(tx.type)}`}
                        >
                          {txTypeLabel(tx.type)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`flex items-center gap-1 font-medium ${
                            tx.amount_cents >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-destructive"
                          }`}
                        >
                          {tx.amount_cents >= 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {formatCurrency(
                            Math.abs(tx.amount_cents) / 100,
                            currency,
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatCurrency(tx.balance_after_cents / 100, currency)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {tx.description ?? "\u2014"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClasses(tx.status)}`}
                        >
                          {tx.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageTab({
  usage,
  loading,
}: {
  usage: ResourceUsage[];
  loading: boolean;
}) {
  const t = useTranslations("SaveMoney");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (usage.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <BarChart3 className="h-8 w-8" />
        <p className="text-sm">{t("usage.none")}</p>
      </div>
    );
  }

  const current = usage[0];

  const metrics = [
    {
      label: t("usage.messagesSent"),
      value: current.messages_sent,
      icon: <Send className="h-4 w-4" />,
    },
    {
      label: t("usage.messagesReceived"),
      value: current.messages_received,
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      label: t("usage.contactsCreated"),
      value: current.contacts_created,
      icon: <Zap className="h-4 w-4" />,
    },
    {
      label: t("usage.broadcasts"),
      value: current.broadcasts_created,
      icon: <Send className="h-4 w-4" />,
    },
    {
      label: t("usage.automations"),
      value: current.automations_executed,
      icon: <Zap className="h-4 w-4" />,
    },
    {
      label: t("usage.aiRequests"),
      value: current.ai_requests,
      icon: <Zap className="h-4 w-4" />,
    },
    {
      label: t("usage.apiRequests"),
      value: current.api_requests,
      icon: <Zap className="h-4 w-4" />,
    },
    {
      label: t("usage.storage"),
      value: Math.round(current.storage_used_bytes / 1024 / 1024),
      suffix: t("usage.mb"),
      icon: <Zap className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("usage.currentPeriod")}</CardTitle>
          <CardDescription>
            {t("usage.periodFrom", { date: formatDate(current.period_start) })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-lg bg-muted/50 p-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {item.icon}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-semibold">
                    {item.value.toLocaleString()}
                    {item.suffix ? ` ${item.suffix}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("usage.monthlyBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("usage.colPeriod")}</TableHead>
                  <TableHead>{t("usage.colSent")}</TableHead>
                  <TableHead>{t("usage.colReceived")}</TableHead>
                  <TableHead>{t("usage.colContacts")}</TableHead>
                  <TableHead>{t("usage.colBroadcasts")}</TableHead>
                  <TableHead>{t("usage.colAutomations")}</TableHead>
                  <TableHead>{t("usage.colAi")}</TableHead>
                  <TableHead>{t("usage.colApi")}</TableHead>
                  <TableHead>{t("usage.colStorage")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {new Date(row.period_start).toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>{row.messages_sent.toLocaleString()}</TableCell>
                    <TableCell>
                      {row.messages_received.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {row.contacts_created.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {row.broadcasts_created.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {row.automations_executed.toLocaleString()}
                    </TableCell>
                    <TableCell>{row.ai_requests.toLocaleString()}</TableCell>
                    <TableCell>{row.api_requests.toLocaleString()}</TableCell>
                    <TableCell>
                      {(row.storage_used_bytes / 1024 / 1024).toFixed(1)} {t("usage.mb")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SavingsAnalyticsTab({
  broadcasts,
  templates,
  pricingRules,
  wallet,
  currency,
  loading,
}: {
  broadcasts: SmartBroadcast[];
  templates: MessageTemplate[];
  pricingRules: PricingRule[];
  wallet: WalletRow | null;
  currency: string;
  loading: boolean;
}) {
  const t = useTranslations("SaveMoney");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalSpent =
    wallet?.used_cents ??
    broadcasts.reduce((s, b) => s + (b.actual_cost_cents ?? 0), 0);
  const totalBudget = wallet?.balance_cents ?? 0;
  const budgetRemaining = totalBudget - totalSpent;

  const avgDeliveryRate =
    broadcasts.length > 0
      ? broadcasts.reduce(
          (s, b) =>
            s +
            (b.audience_count > 0 ? b.delivered_count / b.audience_count : 0),
          0,
        ) / broadcasts.length
      : 0;

  const approvedTemplates = templates.filter(
    (t) => t.status === "APPROVED" || t.status === "Approved",
  );
  const approvalRate =
    templates.length > 0
      ? (approvedTemplates.length / templates.length) * 100
      : 0;

  const marketingRate =
    pricingRules.find((r) => r.category === "marketing" && r.is_active)
      ?.rate_cents ?? 0;
  const utilityRate =
    pricingRules.find((r) => r.category === "utility" && r.is_active)
      ?.rate_cents ?? 0;

  const potentialSaving =
    marketingRate > 0 && utilityRate > 0
      ? ((marketingRate - utilityRate) / marketingRate) * 100
      : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{t("savings.totalSpent")}</p>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-xl font-bold">
              {formatCurrency(totalSpent / 100, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{t("savings.budgetRemaining")}</p>
              {budgetRemaining >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </div>
            <p
              className={`mt-1 text-xl font-bold ${budgetRemaining >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
            >
              {formatCurrency(Math.abs(budgetRemaining) / 100, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">{t("savings.avgDeliveryRate")}</p>
            <p className="mt-1 text-xl font-bold">
              {(avgDeliveryRate * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">{t("savings.templateApproval")}</p>
            <p className="mt-1 text-xl font-bold">
              {approvalRate.toFixed(0)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("savings.optTips")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {potentialSaving > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 p-3 text-sm">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p>
                  {t.rich("savings.tipUtility", {
                    utility: (chunks) => <strong>{chunks}</strong>,
                    marketing: (chunks) => <strong>{chunks}</strong>,
                    percent: potentialSaving.toFixed(0),
                  })}
                </p>
              </div>
            )}
            {approvalRate < 80 && templates.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p>
                  {t("savings.tipApproval", { percent: approvalRate.toFixed(0) })}
                </p>
              </div>
            )}
            {avgDeliveryRate < 0.9 && broadcasts.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p>
                  {t("savings.tipDelivery", { percent: (avgDeliveryRate * 100).toFixed(0) })}
                </p>
              </div>
            )}
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p>
                {t("savings.tipGeneral")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("savings.spendBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("savings.walletBalance")}</span>
                <span className="font-medium">
                  {formatCurrency(totalBudget / 100, currency)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{
                    width: `${totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("savings.spent", { amount: formatCurrency(totalSpent / 100, currency) })}</span>
                <span>
                  {t("savings.remaining", { amount: formatCurrency(Math.max(0, budgetRemaining) / 100, currency) })}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("savings.byCategory")}
              </p>
              {broadcasts.length > 0 ? (
                Object.entries(
                  broadcasts.reduce(
                    (acc, b) => {
                      const cat = b.template_category ?? "uncategorized";
                      acc[cat] = (acc[cat] ?? 0) + (b.actual_cost_cents ?? b.estimated_cost_cents ?? 0);
                      return acc;
                    },
                    {} as Record<string, number>,
                  ),
                )
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, cost]) => (
                    <div
                      key={cat}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="capitalize text-muted-foreground">
                        {cat}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(cost / 100, currency)}
                      </span>
                    </div>
                  ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("savings.noCampaignData")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SaveMoneyPage() {
  const { accountId, user, defaultCurrency } = useAuth();
  const t = useTranslations("SaveMoney");
  const supabase = createClient();

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [broadcasts, setBroadcasts] = useState<SmartBroadcast[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [usage, setUsage] = useState<ResourceUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [addAmount, setAddAmount] = useState("");
  const [adding, setAdding] = useState(false);

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);

    try {
      const [
        templatesRes,
        broadcastsRes,
        pricingRes,
        walletRes,
        txRes,
        usageRes,
      ] = await Promise.all([
        supabase
          .from("message_templates")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false }),
        supabase
          .from("smart_broadcasts")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("pricing_rules")
          .select("*")
          .eq("account_id", accountId)
          .eq("is_active", true),
        supabase
          .from("wallets")
          .select("*")
          .eq("account_id", accountId)
          .maybeSingle(),
        supabase
          .from("wallet_transactions")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("resource_usage")
          .select("*")
          .eq("account_id", accountId)
          .order("period_start", { ascending: false })
          .limit(12),
      ]);

      if (templatesRes.error) throw templatesRes.error;
      if (broadcastsRes.error) throw broadcastsRes.error;
      if (pricingRes.error) throw pricingRes.error;
      if (txRes.error) throw txRes.error;
      if (usageRes.error) throw usageRes.error;

      setTemplates((templatesRes.data ?? []) as MessageTemplate[]);
      setBroadcasts((broadcastsRes.data ?? []) as SmartBroadcast[]);
      setPricingRules((pricingRes.data ?? []) as PricingRule[]);
      setWallet(walletRes.data as WalletRow | null);
      setTransactions((txRes.data ?? []) as WalletTransaction[]);
      setUsage((usageRes.data ?? []) as ResourceUsage[]);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("common.failedLoad");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddFunds = useCallback(async () => {
    if (!wallet || !addAmount) return;
    setAdding(true);
    try {
      const amountCents = Math.round(parseFloat(addAmount) * 100);
      if (isNaN(amountCents) || amountCents <= 0) return;

      const { data, error: rpcErr } = await supabase.rpc("update_wallet_balance", {
        p_wallet_id: wallet.id,
        p_amount_cents: amountCents,
        p_type: "credit_purchase",
        p_description: "Manual wallet top-up",
        p_created_by: user?.id ?? null,
      });

      if (rpcErr) throw rpcErr;

      const result = (data ?? {}) as { success: boolean; balance_after?: number; error?: string };
      if (!result.success) {
        throw new Error(result.error ?? "Failed to update wallet balance");
      }

      setWallet((prev) =>
        prev
          ? { ...prev, balance_cents: result.balance_after ?? prev.balance_cents + amountCents }
          : prev,
      );
      setAddFundsOpen(false);
      setAddAmount("");
      await loadData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("common.failedAddFunds");
      setError(message);
    } finally {
      setAdding(false);
    }
  }, [wallet, addAmount, supabase, loadData, t, user?.id]);

  const currency = wallet?.currency ?? defaultCurrency;

  if (error && !loading && templates.length === 0 && !wallet) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={loadData}>
          <Loader2 className="mr-2 h-4 w-4" />
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="flex-wrap">
          <TabsTrigger value="templates">{t("tabs.templates")}</TabsTrigger>
          <TabsTrigger value="campaigns">{t("tabs.campaigns")}</TabsTrigger>
          <TabsTrigger value="whatsapp">{t("tabs.whatsapp")}</TabsTrigger>
          <TabsTrigger value="broadcast">{t("tabs.broadcast")}</TabsTrigger>
          <TabsTrigger value="calculator">{t("tabs.calculator")}</TabsTrigger>
          <TabsTrigger value="wallet">{t("tabs.wallet")}</TabsTrigger>
          <TabsTrigger value="usage">{t("tabs.usage")}</TabsTrigger>
          <TabsTrigger value="savings">{t("tabs.savings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <TemplatesTab
            templates={templates}
            pricingRules={pricingRules}
            loading={loading}
            currency={currency}
          />
        </TabsContent>

        <TabsContent value="campaigns">
          <CampaignsTab
            broadcasts={broadcasts}
            loading={loading}
            currency={currency}
          />
        </TabsContent>

        <TabsContent value="whatsapp">
          <CampaignsTab
            broadcasts={broadcasts.filter(
              (b) =>
                b.template_category?.toLowerCase() !== "authentication" ||
                b.meta_category?.toLowerCase() !== "authentication",
            )}
            loading={loading}
            currency={currency}
          />
        </TabsContent>

        <TabsContent value="broadcast">
          <CampaignsTab
            broadcasts={broadcasts.filter(
              (b) =>
                b.audience_type === "all" ||
                b.audience_type === "segment" ||
                b.audience_type === "uploaded",
            )}
            loading={loading}
            currency={currency}
          />
        </TabsContent>

        <TabsContent value="calculator">
          <CostCalculatorTab
            pricingRules={pricingRules}
            currency={currency}
          />
        </TabsContent>

        <TabsContent value="wallet">
          <WalletTab
            wallet={wallet}
            transactions={transactions}
            loading={loading}
            currency={currency}
            onAddFunds={() => setAddFundsOpen(true)}
          />
        </TabsContent>

        <TabsContent value="usage">
          <UsageTab usage={usage} loading={loading} />
        </TabsContent>

        <TabsContent value="savings">
          <SavingsAnalyticsTab
            broadcasts={broadcasts}
            templates={templates}
            pricingRules={pricingRules}
            wallet={wallet}
            currency={currency}
            loading={loading}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={addFundsOpen} onOpenChange={setAddFundsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialog.addFunds")}</DialogTitle>
            <DialogDescription>
              {t("dialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="fund-amount">{t("dialog.amount")}</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="fund-amount"
                  type="number"
                  min={1}
                  step={0.01}
                  placeholder="0.00"
                  className="pl-9"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddFundsOpen(false)}
              disabled={adding}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleAddFunds}
              disabled={adding || !addAmount || parseFloat(addAmount) <= 0}
            >
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("dialog.addFunds")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}