"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { ShieldX, ArrowLeft } from "lucide-react";

export function UnauthorizedAccess() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
            <ShieldX className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            Access Denied
          </h1>
          <p className="text-sm text-muted-foreground">
            You are authenticated, but you do not have Super Admin access.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Please contact an existing Super Admin to request access.
              Only authorized platform members can access this area.
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
