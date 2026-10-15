"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Shield,
  ShieldOff,
  ShieldPlus,
  UserMinus,
  Search,
  AlertTriangle,
} from "lucide-react";

interface SuperAdminMember {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export function SuperAdminMembersCard() {
  const { user: currentUser } = useAuth();
  const supabase = createClient();
  const [members, setMembers] = useState<SuperAdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_super_admin_members",
      );
      if (rpcError) {
        console.error("[SuperAdminMembers] RPC error:", rpcError.message);
        setError("Unable to load super admin members. Please try again.");
        return;
      }
      setMembers((data as SuperAdminMember[]) ?? []);
    } catch {
      setError("Unable to load super admin members. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleDemote = async (userId: string, email: string) => {
    if (
      !confirm(
        `Remove Super Admin access from ${email}? They will lose access to the Super Admin dashboard.`,
      )
    ) {
      return;
    }
    setActionLoading(userId);
    try {
      const { error: rpcError } = await supabase.rpc("set_super_admin_role", {
        target_user_id: userId,
        make_super_admin: false,
      });
      if (rpcError) {
        alert(`Failed to remove Super Admin access: ${rpcError.message}`);
        return;
      }
      await fetchMembers();
    } catch {
      alert("An unexpected error occurred. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromote = async () => {
    const email = searchQuery.trim().toLowerCase();
    if (!email) return;

    setActionLoading("promote");
    try {
      // Find the user by email
      const { data: profiles, error: lookupError } = await supabase
        .from("profiles")
        .select("user_id, email")
        .eq("email", email)
        .maybeSingle();

      if (lookupError || !profiles) {
        alert("No user found with that email address.");
        return;
      }

      const { error: rpcError } = await supabase.rpc("set_super_admin_role", {
        target_user_id: profiles.user_id,
        make_super_admin: true,
      });

      if (rpcError) {
        alert(`Failed to grant Super Admin access: ${rpcError.message}`);
        return;
      }

      setSearchQuery("");
      await fetchMembers();
    } catch {
      alert("An unexpected error occurred. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
  );

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Super Admin Members
        </CardTitle>
        <CardDescription>
          Manage who has Super Admin access. Only authorized members can access
          the Super Admin dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Promote form */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter email to promote..."
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePromote}
            disabled={actionLoading === "promote" || !searchQuery.trim()}
          >
            <ShieldPlus className="mr-1.5 h-3.5 w-3.5" />
            {actionLoading === "promote" ? "Promoting..." : "Promote"}
          </Button>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive/50" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchMembers}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Shield className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? `No members matching "${searchQuery}".`
                : "No Super Admin members found."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredMembers.map((member) => {
              const isCurrentUser = member.user_id === currentUser?.id;
              return (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {member.full_name || member.email}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (You)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added{" "}
                      {new Date(member.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {!isCurrentUser && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDemote(member.user_id, member.email)
                      }
                      disabled={actionLoading === member.user_id}
                    >
                      <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
                      {actionLoading === member.user_id
                        ? "Removing..."
                        : "Remove"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            Super Admin access is validated server-side. Only users with{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              platform_role = &apos;super_admin&apos;
            </code>{" "}
            in the profiles table can access the Super Admin dashboard.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
