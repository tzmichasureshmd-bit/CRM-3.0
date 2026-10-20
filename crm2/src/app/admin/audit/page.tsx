import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ScrollText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const PAGE_SIZE = 50;

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface Props {
  basePath?: string;
  searchParams?: SearchParams;
}

/** Shared by /admin and /super-admin — links derive from `basePath`. */
export async function AdminAuditPage({
  basePath = "/admin",
  searchParams,
}: Props = {}) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();

  const page = Math.max(1, Number(params.page) || 1);
  const accountId =
    typeof params.account_id === "string" ? params.account_id.trim() : "";
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("audit_log")
    .select(
      "id, actor_email, action, resource_type, resource_id, account_id, details, created_at",
      { count: "exact" }
    );

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data: logs, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  function pageUrl(p: number) {
    const sp = new URLSearchParams();
    if (p > 1) sp.set("page", String(p));
    if (accountId) sp.set("account_id", accountId);
    return `${basePath}/audit?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Audit Logs</h2>
          <p className="text-muted-foreground">
            Full platform activity log for super-admin review.
          </p>
        </div>
        {typeof count === "number" && (
          <span className="text-sm text-muted-foreground">
            {count.toLocaleString()} entr{count === 1 ? "y" : "ies"}
          </span>
        )}
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <form className="flex items-center gap-2">
            <input
              type="text"
              name="account_id"
              defaultValue={accountId}
              placeholder="Filter by account ID..."
              className="h-9 w-full max-w-sm rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" variant="outline" size="sm">
              Filter
            </Button>
            {accountId && (
              <Link href={basePath + "/audit"} className="inline-flex">
                <Button type="button" variant="ghost" size="sm">
                  Clear
                </Button>
              </Link>
            )}
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-sm text-destructive">
                Failed to load audit logs. Please try again.
              </p>
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ScrollText className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {accountId
                  ? `No audit entries for account "${accountId}".`
                  : "No audit log entries found."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Resource</th>
                    <th className="px-4 py-3">Resource ID</th>
                    <th className="px-4 py-3">Account ID</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log: Record<string, unknown>) => (
                    <tr
                      key={log.id as string}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                        {(log.actor_email as string) || (
                          <span className="text-muted-foreground">System</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                          {log.action as string}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {log.resource_type as string}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                        {log.resource_id
                          ? String(log.resource_id).slice(0, 8)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                        {log.account_id
                          ? String(log.account_id).slice(0, 8)
                          : "—"}
                      </td>
                      <td className="max-w-[200px] whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {log.details
                          ? typeof log.details === "object"
                            ? JSON.stringify(log.details).slice(0, 60)
                            : String(log.details)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {log.created_at
                          ? new Date(log.created_at as string).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Link href={pageUrl(Math.max(1, page - 1))}>
                <Button
                  variant="outline"
                  size="icon-xs"
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              </Link>
              <Link href={pageUrl(Math.min(totalPages, page + 1))}>
                <Button
                  variant="outline"
                  size="icon-xs"
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  return <AdminAuditPage basePath="/admin" searchParams={searchParams} />;
}
