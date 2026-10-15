import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";

const PAGE_SIZE = 20;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface Props {
  basePath?: string;
  searchParams?: SearchParams;
}

/** Shared by /admin and /super-admin — links derive from `basePath`. */
export async function AdminUsersPage({
  basePath = "/admin",
  searchParams,
}: Props = {}) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, email, account_role, platform_role, created_at, account_id, accounts(name)",
      { count: "exact" }
    );

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data: users, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  function pageUrl(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (p > 1) sp.set("page", String(p));
    return `${basePath}/users?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Users</h2>
          <p className="text-muted-foreground">
            All platform users across every account.
          </p>
        </div>
        {typeof count === "number" && (
          <span className="text-sm text-muted-foreground">
            {count.toLocaleString()} user{count !== 1 && "s"}
          </span>
        )}
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <form className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search by name or email..."
                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
            {q && (
              <Link href={basePath + "/users"} className="inline-flex">
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
                Failed to load users. Please try again.
              </p>
            </div>
          ) : !users || users.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {q
                  ? `No users matching "${q}".`
                  : "No users found on the platform."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Account Role</th>
                    <th className="px-4 py-3">Platform Role</th>
                    <th className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        Joined <ArrowUpDown className="h-3 w-3" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u: Record<string, unknown>) => {
                    const account = u.accounts as
                      | { name: string | null }
                      | null;
                    return (
                      <tr
                        key={u.id as string}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {(u.full_name as string) || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {u.email as string}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {account?.name || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <RoleBadge role={u.account_role as string | null} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <PlatformBadge
                            role={u.platform_role as string | null}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {u.created_at
                            ? new Date(u.created_at as string).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
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

function RoleBadge({ role }: { role: string | null }) {
  if (!role)
    return (
      <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        —
      </span>
    );
  const colors: Record<string, string> = {
    owner: "bg-primary/10 text-primary",
    admin: "bg-blue-500/10 text-blue-500",
    agent: "bg-emerald-500/10 text-emerald-500",
    viewer: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${colors[role] ?? colors.viewer}`}
    >
      {role}
    </span>
  );
}

function PlatformBadge({ role }: { role: string | null }) {
  const isSuperAdmin = role === "super_admin";
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${
        isSuperAdmin
          ? "bg-amber-500/10 text-amber-600"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {isSuperAdmin ? "Super Admin" : "User"}
    </span>
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  return <AdminUsersPage basePath="/admin" searchParams={searchParams} />;
}
