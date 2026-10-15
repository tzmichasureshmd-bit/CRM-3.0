import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Smartphone,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  connected: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  disconnected: "bg-muted text-muted-foreground",
  pending: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  error: "bg-destructive/10 text-destructive",
};

interface AdminWhatsappPageProps {
  basePath?: string;
}

/**
 * Platform-wide WhatsApp connection monitor: which businesses have a
 * Cloud API config, and whether each is actually connected. Read-only
 * — fixing a broken connection is the business owner's job in Settings;
 * this gives support the state they need to triage tickets.
 */
export async function AdminWhatsappPage({
  basePath = "/admin",
}: AdminWhatsappPageProps = {}) {
  const supabase = await createClient();

  const [configsResult, countsResult] = await Promise.all([
    supabase
      .from("whatsapp_config")
      .select(
        `
        id, display_phone_number, business_name, connection_status,
        status, connected_at, created_at,
        accounts ( id, name )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("whatsapp_config").select("connection_status"),
  ]);

  const { data: configs, error } = configsResult;
  const allStatuses = (countsResult.data ?? []).map(
    (r: { connection_status: string | null }) => r.connection_status ?? "disconnected",
  );
  const countBy = (s: string) => allStatuses.filter((x) => x === s).length;

  const stats = {
    total: allStatuses.length,
    connected: countBy("connected"),
    disconnected: countBy("disconnected"),
    pending: countBy("pending"),
    error: countBy("error"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">WhatsApp Monitor</h2>
        <p className="text-muted-foreground">
          Cloud API connection health across every business on the platform.
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Smartphone className="h-5 w-5" />}
          label="Total Configs"
          value={stats.total}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Connected"
          value={stats.connected}
          iconColor="text-emerald-500"
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Pending"
          value={stats.pending}
          iconColor="text-blue-500"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Error / Disconnected"
          value={stats.error + stats.disconnected}
          iconColor="text-destructive"
        />
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">Connections</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="py-16 text-center text-sm text-destructive">
              Failed to load connections: {error.message}
            </div>
          ) : !configs || configs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <XCircle className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                No WhatsApp configs yet
              </p>
              <p className="text-xs text-muted-foreground">
                Businesses connect their Cloud API numbers from Settings.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Connection</th>
                    <th className="px-4 py-3">Connected At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(configs as Array<Record<string, unknown>>).map((row) => {
                    const accountRows = row.accounts as unknown as
                      | { id: string; name: string | null }[]
                      | null;
                    const account = Array.isArray(accountRows)
                      ? accountRows[0] ?? null
                      : accountRows;
                    const conn =
                      (row.connection_status as string | null) ??
                      (row.status as string | null) ??
                      "disconnected";
                    return (
                      <tr key={row.id as string} className="transition-colors hover:bg-muted/50">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {(row.business_name as string | null) ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {account ? (
                            <Link
                              href={`${basePath}/businesses/${account.id}`}
                              className="text-primary hover:underline"
                            >
                              {account.name ?? "View"}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {(row.display_phone_number as string | null) ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                              STATUS_STYLES[conn] ?? STATUS_STYLES.disconnected
                            }`}
                          >
                            {conn}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {row.connected_at
                            ? new Date(row.connected_at as string).toLocaleString()
                            : "Never"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  iconColor?: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex items-center gap-4 py-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ${
            iconColor ?? "text-primary"
          }`}
        >
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">
            {value.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WhatsappPage() {
  return <AdminWhatsappPage basePath="/admin" />;
}
