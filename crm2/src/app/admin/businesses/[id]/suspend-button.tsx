"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pause, Play, Loader2 } from "lucide-react";

interface SuspendAccountButtonProps {
  accountId: string;
  currentStatus: string;
}

export function SuspendAccountButton({
  accountId,
  currentStatus,
}: SuspendAccountButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isSuspended = currentStatus === "suspended";
  const newStatus = isSuspended ? "active" : "suspended";

  async function handleToggle() {
    if (
      !confirm(
        isSuspended
          ? "Reactivate this account?"
          : "Suspend this account? Members will lose access."
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error ?? "Failed to update account status.");
        return;
      }

      router.refresh();
    } catch {
      alert("A network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={isSuspended ? "default" : "destructive"}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : isSuspended ? (
        <Play className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <Pause className="mr-1.5 h-3.5 w-3.5" />
      )}
      {loading
        ? "Updating..."
        : isSuspended
          ? "Reactivate"
          : "Suspend"}
    </Button>
  );
}
