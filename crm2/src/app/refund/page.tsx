import Link from "next/link";
import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "Refund Policy for TZmicha WhatsApp CRM. Learn about our cancellation and refund terms.",
  robots: { index: true, follow: true },
};

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <MessageSquare className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              TZmicha
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-foreground">Refund Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: August 2026
        </p>

        <div className="prose prose-neutral mt-8 space-y-6 text-foreground dark:prose-invert">
          <section>
            <h2 className="text-xl font-semibold">1. General Policy</h2>
            <p className="mt-2 text-muted-foreground">
              We offer refunds within 7 days of your initial subscription
              purchase if you are not satisfied with the service. After 7 days,
              subscriptions are non-refundable but can be cancelled for the
              next billing cycle.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Eligibility</h2>
            <p className="mt-2 text-muted-foreground">
              To be eligible for a refund: (a) the request must be made within
              7 days of the original payment, (b) you must not have
              substantially used the paid features, and (c) the refund request
              must be submitted through our support page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Process</h2>
            <p className="mt-2 text-muted-foreground">
              Submit a refund request through our support page with your account
              email and reason for the request. We will review and respond
              within 3 business days. Approved refunds are processed within
              5-10 business days to the original payment method.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Exceptions</h2>
            <p className="mt-2 text-muted-foreground">
              Refunds are not available for: (a) annual subscriptions after 14
              days, (b) accounts terminated for Terms of Service violations,
              (c) add-on purchases or overage charges, or (d) promotional or
              discounted purchases unless stated otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Cancellation</h2>
            <p className="mt-2 text-muted-foreground">
              You may cancel your subscription at any time from your billing
              page. Cancellation takes effect at the end of the current billing
              period. You will retain access until that date. No partial
              refunds are issued for mid-period cancellations after the 7-day
              window.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Contact</h2>
            <p className="mt-2 text-muted-foreground">
              For refund requests or questions, contact us through our support
              page.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6 sm:px-6">
          <p className="text-xs text-muted-foreground">
            © 2026 TZmicha. All rights reserved.
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/refund" className="hover:text-foreground">
              Refund
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
