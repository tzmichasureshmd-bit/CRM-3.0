"use client";

import { useAuth } from "@/hooks/use-auth";
import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Code, Globe, Webhook } from "lucide-react";
import Link from "next/link";

// API / Developer hub for the customer CRM. Reuses the exact same
// API-keys manager as Settings → API keys (single backend, no
// duplicate key store) and documents the live /api/v1 surface.

const REST_ENDPOINTS = [
  { method: "GET", path: "/api/v1/me", desc: "Authenticated account + profile" },
  { method: "GET", path: "/api/v1/contacts", desc: "List / search contacts" },
  { method: "POST", path: "/api/v1/contacts", desc: "Create a contact" },
  { method: "GET", path: "/api/v1/conversations", desc: "List conversations" },
  { method: "GET", path: "/api/v1/messages", desc: "List messages (filtered)" },
  { method: "POST", path: "/api/v1/messages", desc: "Send a WhatsApp message" },
  { method: "GET", path: "/api/v1/broadcasts", desc: "List broadcast campaigns" },
  { method: "POST", path: "/api/v1/webhooks", desc: "Register a webhook endpoint" },
] as const;

export default function ApiDeveloperPage() {
  const { user, loading } = useAuth();

  if (!loading && !user) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <Code className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">
          Sign in to manage your API keys
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-primary hover:underline"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">API / Developer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Integrate your CRM with external systems using the REST API and
          webhooks.
        </p>
      </div>

      <ApiKeysSettings />

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-primary" />
            REST API reference
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            Authenticate every request with the header{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
              Authorization: Bearer &lt;your API key&gt;
            </code>
            . Keys are scoped — mint one per integration from the list above.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Method</th>
                  <th className="px-4 py-2.5">Endpoint</th>
                  <th className="px-4 py-2.5">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {REST_ENDPOINTS.map((e) => (
                  <tr key={`${e.method} ${e.path}`}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-semibold text-primary">
                      {e.method}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-foreground">
                      {e.path}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {e.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-4 w-4 text-primary" />
            Webhooks
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Register HTTPS endpoints to receive real-time events (new messages,
          conversation updates, delivery receipts) as they happen. Manage
          destinations via{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
            POST /api/v1/webhooks
          </code>{" "}
          with any scoped API key.
        </CardContent>
      </Card>
    </div>
  );
}
