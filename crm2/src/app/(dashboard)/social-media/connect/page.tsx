"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Info,
  Loader2,
  ThumbsUp,
} from "lucide-react";

/**
 * Connect page for Facebook / Instagram Lead Ads.
 *
 * Entry point for the "Connect Facebook" / "Connect Instagram" buttons on
 * the Social Media page. Clicking the connect button starts the existing
 * server-side Meta OAuth flow (/api/meta/leads/connect) and returns the
 * user to /social-media on completion. Keeps ONE Back button that returns
 * to the existing Social Media page.
 */

const CONNECT_URL = "/api/meta/leads/connect";

export default function SocialMediaConnectPage() {
  return (
    <Suspense fallback={null}>
      <SocialMediaConnectInner />
    </Suspense>
  );
}

function SocialMediaConnectInner() {
  const searchParams = useSearchParams();
  const isInstagram = searchParams.get("platform") === "instagram";
  const [connecting, setConnecting] = useState(false);

  const startConnect = () => {
    if (connecting) return; // disable duplicate clicks
    setConnecting(true);
    window.location.href =
      CONNECT_URL + "?return_to=" + encodeURIComponent("/social-media");
  };

  const icon = isInstagram ? (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-500/10">
      <Camera className="size-6 text-pink-500" />
    </div>
  ) : (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
      <ThumbsUp className="size-6 text-[#1877F2]" />
    </div>
  );

  const heading = isInstagram ? "Connect Instagram" : "Connect Facebook";
  const description = isInstagram
    ? "Connect your Instagram Professional account to TZMicha CRM and automatically capture Leads Ads and engagement into your CRM."
    : "Connect your Facebook Page to TZMicha CRM and automatically capture your Lead Ads into your CRM.";

  const features = [
    "Automatically receive Facebook leads",
    "Sync leads with Contacts",
    "Track lead sources",
    "Manage leads from your CRM",
  ];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Link
        href="/social-media"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>

      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-4">
          {icon}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {heading}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <ul className="mt-6 space-y-2.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2.5 text-sm">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              <span className="text-foreground">{feature}</span>
            </li>
          ))}
        </ul>

        {isInstagram && (
          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-foreground">
              Instagram requires a Professional account linked to the same
              Facebook Page. When you connect a Page with a linked Instagram
              Professional account, the Instagram account is connected
              automatically — no separate login needed.
            </p>
          </div>
        )}

        <div className="mt-8">
          <button
            type="button"
            onClick={startConnect}
            disabled={connecting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          >
            {connecting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                {isInstagram ? (
                  <Camera className="size-4" />
                ) : (
                  <ThumbsUp className="size-4" />
                )}
                Connect {isInstagram ? "Instagram" : "Facebook"}
              </>
            )}
          </button>
          <p className="mt-3 text-xs text-muted-foreground">
            You will be taken to Meta to authorize the connection. TZMicha CRM
            only requests permission to read the Pages and leads you choose —
            your login details never reach the CRM.
          </p>
        </div>
      </div>
    </div>
  );
}