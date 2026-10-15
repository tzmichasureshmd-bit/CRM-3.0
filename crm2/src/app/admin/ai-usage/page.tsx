import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bot } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminAiUsagePage() {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("resource_usage")
    .select("account_id, ai_requests, period_start, accounts(name)")
    .order("period_start", { ascending: false });

  type Row = {
    account_id: string;
    ai_requests: number;
    period_start: string;
    accounts: { name: string | null } | null;
  };

  const byAccount = new Map<
    string,
    { name: string; total: number; periods: { period: string; count: number }[] }
  >();

  if (rows) {
    for (const row of rows as unknown as Row[]) {
      const existing = byAccount.get(row.account_id);
      if (existing) {
        existing.total += row.ai_requests;
        existing.periods.push({
          period: row.period_start,
          count: row.ai_requests,
        });
      } else {
        byAccount.set(row.account_id, {
          name: row.accounts?.name ?? "Unknown",
          total: row.ai_requests,
          periods: [
            { period: row.period_start, count: row.ai_requests },
          ],
        });
      }
    }
  }

  const accounts = Array.from(byAccount.values()).sort(
    (a, b) => b.total - a.total
  );

  const totalAiRequests = accounts.reduce((sum, a) => sum + a.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">AI Usage</h2>
        <p className="text-muted-foreground">
          AI request consumption across every account on the platform.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-violet-500" />
                Total AI Requests
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {totalAiRequests.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Accounts Using AI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {accounts.length.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Per-Account AI Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-sm text-destructive">
                Failed to load AI usage data. Please try again.
              </p>
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Bot className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No AI usage recorded yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3 text-right">Total Requests</th>
                    <th className="px-4 py-3">Period Breakdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {accounts.map((account) => (
                    <tr
                      key={account.name}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                        {account.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-foreground">
                        {account.total.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex flex-wrap gap-1">
                          {account.periods
                            .sort((a, b) => b.period.localeCompare(a.period))
                            .map((p) => (
                              <span
                                key={p.period}
                                className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs"
                              >
                                {p.period}: {p.count.toLocaleString()}
                              </span>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
