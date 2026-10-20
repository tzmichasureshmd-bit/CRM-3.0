import Link from "next/link";
import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for TZmicha WhatsApp CRM. Read our terms and conditions.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-foreground">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: August 2026
        </p>

        <div className="prose prose-neutral mt-8 space-y-6 text-foreground dark:prose-invert">
          <section>
            <h2 className="text-xl font-semibold">1. Acceptance</h2>
            <p className="mt-2 text-muted-foreground">
              By accessing or using TZmicha WhatsApp CRM, you agree to these
              Terms of Service. If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Service Description</h2>
            <p className="mt-2 text-muted-foreground">
              TZmicha provides a cloud-based CRM platform that integrates with
              the WhatsApp Business API. The service includes contact
              management, conversation management, campaigns, automation, and
              team collaboration features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Account Registration</h2>
            <p className="mt-2 text-muted-foreground">
              You must provide accurate information during registration. You are
              responsible for maintaining the security of your account
              credentials. One person or entity may not maintain more than one
              free account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              4. Subscriptions and Payment
            </h2>
            <p className="mt-2 text-muted-foreground">
              Paid plans are billed in advance on a monthly or yearly basis.
              All payments are processed through our secure payment provider.
              Prices are listed in Indian Rupees (INR) unless otherwise stated.
              We reserve the right to change pricing with 30 days notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Cancellation</h2>
            <p className="mt-2 text-muted-foreground">
              You may cancel your subscription at any time from your billing
              page. Cancellation takes effect at the end of the current billing
              period. You will retain access to the service until that date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              6. Acceptable Use
            </h2>
            <p className="mt-2 text-muted-foreground">
              You agree not to use the service for spam, harassment, illegal
              activities, or in violation of WhatsApp Business Policy and Meta
              terms. We reserve the right to suspend accounts that violate these
              terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              7. Intellectual Property
            </h2>
            <p className="mt-2 text-muted-foreground">
              The TZmicha platform, including its design, code, and
              documentation, is owned by TZmicha. You retain ownership of your
              CRM data (contacts, messages, campaigns).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Limitation of Liability</h2>
            <p className="mt-2 text-muted-foreground">
              TZmicha is provided &quot;as is&quot; without warranties of any
              kind. We are not liable for indirect, incidental, or consequential
              damages. Our total liability shall not exceed the amount paid by
              you in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Changes to Terms</h2>
            <p className="mt-2 text-muted-foreground">
              We may update these terms from time to time. Continued use of the
              service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Contact</h2>
            <p className="mt-2 text-muted-foreground">
              For questions about these terms, contact us through our support
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
