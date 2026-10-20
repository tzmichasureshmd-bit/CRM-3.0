"use client";

import Link from "next/link";
import { ShieldX, ArrowLeft, Crown } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface OrgAdminDeniedProps {
  reason: "super_admin" | "insufficient_role";
  currentRole?: string;
  email?: string | null;
}

export function OrgAdminDenied({ reason, currentRole, email }: OrgAdminDeniedProps) {
  if (reason === "super_admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
              <Crown className="h-6 w-6 text-amber-500" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Super Admin Detected</h1>
            <p className="text-sm text-muted-foreground">
              You are signed in as a Super Admin.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
              {email && (
                <p className="text-xs text-center text-muted-foreground font-mono">{email}</p>
              )}
              <p className="text-sm text-center text-muted-foreground">
                Super Admins use the <strong className="text-foreground">/super-admin</strong> panel,
                not the Organisation Admin panel. The Org Admin panel is for company owners and admins only.
              </p>
            </div>
            <Link href="/super-admin" className="block">
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                Go to Super Admin Panel
              </Button>
            </Link>
            <Link href="/dashboard" className="block">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
            <ShieldX className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Access Denied</h1>
          <p className="text-sm text-muted-foreground">
            You do not have Organisation Admin access.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
            {email && (
              <p className="text-xs text-center text-muted-foreground font-mono">{email}</p>
            )}
            <p className="text-sm text-center text-muted-foreground">
              Your current role is{" "}
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-foreground">
                {currentRole}
              </span>
              . Only <strong className="text-foreground">owner</strong> or{" "}
              <strong className="text-foreground">admin</strong> roles can access this panel.
            </p>
            <p className="text-xs text-center text-muted-foreground">
              Contact your organisation owner to request admin access.
            </p>
          </div>
          <Link href="/dashboard" className="block">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
