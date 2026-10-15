import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DollarSign,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
} from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface AdminPaymentsPageProps {
  basePath?: string;
  searchParams?: SearchParams;
}

/** Shared by /admin and /super-admin — links derive from `basePath`. */
export async function AdminPaymentsPage({
  basePath = "/super-admin",
  searchParams,
}: AdminPaymentsPageProps = {}) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();

  const statusFilter =
    typeof params.status === "string" ? params.status.trim() : "";

  let query = supabase
    .from("payments")
    .select(
      `
        id,
        amount_cents,
        currency,
        status,
        provider,
        provider_payment_id,
        description,
        created_at,
        accounts(name, owner_user_id)
      `,
      { count: "exact" }
    );

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const {
    data: payments,
    count,
    error,
  } = await query.order("created_at", { ascending: false }).limit(100);

  const statusOptions = [
    { value: "", label: "All" },
    { value: "succeeded", label: "Succeeded" },
    { value: "pending", label: "Pending" },
    { value: "processing", label: "Processing" },
    { value: "failed", label: "Failed" },
    { value: "refunded", label: "Refunded" },
  ];

  function statusUrl(s: string) {
    const sp = new URLSearchParams();
    if (s) sp.set("status", s);
    return `${basePath}/payments?${sp.toString()}`;
  }

  const totalRevenue =
    payments
      ?.filter((p) => p.status === "succeeded")
      .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0) ?? 0;

  const succeededCount =
    payments?.filter((p) => p.status === "succeeded").length ?? 0;

  const pendingCount =
    payments?.filter((p) => p.status === "pending" || p.status === "processing")
      .length ?? 0;

  const failedCount =
    payments?.filter((p) => p.status === "failed").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Payments</h2>
        <p className="text-muted-foreground">
          Platform payment transactions across all customers.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Revenue"
          value={`₹${(totalRevenue / 100).toLocaleString()}`}
          icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
        />
        <SummaryCard
          title="Succeeded"
          value={succeededCount}
          icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
          href={statusFilter === "succeeded" ? undefined : statusUrl("succeeded")}
        />
        <SummaryCard
          title="Pending"
          value={pendingCount}
          icon={<Clock className="h-4 w-4 text-blue-500" />}
          href={statusFilter === "pending" ? undefined : statusUrl("pending")}
        />
        <SummaryCard
          title="Failed"
          value={failedCount}
          icon={<XCircle className="h-4 w-4 text-destructive" />}
          href={statusFilter === "failed" ? undefined : statusUrl("failed")}
        />
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Filter by status
              </span>
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              {statusOptions.map((opt) => (
                <a key={opt.value} href={statusUrl(opt.value)}>
                  <span
                    className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium transition-colors ${
                      statusFilter === opt.value || (!statusFilter && !opt.value)
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-sm text-destructive">
                Failed to load payment data. Please try again.
              </p>
            </div>
          ) : !payments || payments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {statusFilter
                  ? `No payments with status "${statusFilter}".`
                  : "No payments found."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Transaction ID</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((payment) => {
                    const accountsArr = payment.accounts as
                      | Array<{ name: string | null }>
                      | null;
                    const account = Array.isArray(accountsArr) ? accountsArr[0] ?? null : null;
                    return (
                      <tr
                        key={payment.id}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {account?.name || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {payment.amount_cents != null
                            ? `${payment.currency === "INR" ? "₹" : "$"}${(payment.amount_cents / 100).toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <PaymentStatusBadge status={payment.status} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {payment.provider || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground font-mono text-xs">
                          {payment.provider_payment_id || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {payment.description || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {new Date(payment.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {typeof count === "number" && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {count.toLocaleString()} payment{count !== 1 && "s"}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  href,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  href?: string;
}) {
  const content = (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {icon}
            {title}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-foreground">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <a href={href} className="block transition-opacity hover:opacity-80">
        {content}
      </a>
    );
  }
  return content;
}

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    succeeded: "bg-emerald-500/10 text-emerald-600",
    pending: "bg-blue-500/10 text-blue-600",
    processing: "bg-blue-500/10 text-blue-600",
    failed: "bg-destructive/10 text-destructive",
    refunded: "bg-orange-500/10 text-orange-600",
    partially_refunded: "bg-orange-500/10 text-orange-600",
  };
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default async function SuperAdminPaymentsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  return <AdminPaymentsPage basePath="/super-admin" searchParams={searchParams} />;
}
