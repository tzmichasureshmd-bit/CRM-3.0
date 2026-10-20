import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

const roleColor: Record<string, string> = {
  owner: "bg-amber-500/10 text-amber-600",
  admin: "bg-primary/10 text-primary",
  agent: "bg-emerald-500/10 text-emerald-600",
  viewer: "bg-muted text-muted-foreground",
};

export default async function OrgAdminTeamPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.account_id) redirect("/dashboard");

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, email, account_role, created_at")
    .eq("account_id", profile.account_id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Team Members</h2>
        <p className="text-muted-foreground">
          {members?.length ?? 0} member{(members?.length ?? 0) !== 1 ? "s" : ""} in your organisation.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>All Members</CardTitle>
          <CardDescription>Everyone with access to your organisation</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!members || members.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No team members yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/50 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                        {m.full_name ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{m.email}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleColor[m.account_role ?? "viewer"] ?? roleColor.viewer}`}>
                          {m.account_role ?? "viewer"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString()}
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
