import Link from "next/link";
import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for TZmicha WhatsApp CRM. Learn how we collect, use, and protect your data.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: August 2026
        </p>

        <div className="prose prose-neutral mt-8 space-y-6 text-foreground dark:prose-invert">
          <section>
            <h2 className="text-xl font-semibold">1. Introduction</h2>
            <p className="mt-2 text-muted-foreground">
              TZmicha (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;)
              operates the WhatsApp CRM platform. This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when
              you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              2. Information We Collect
            </h2>
            <p className="mt-2 text-muted-foreground">
              We collect information you provide directly: account registration
              details (name, email), payment information (processed securely by
              our payment provider), and CRM data you input (contacts,
              messages, campaigns).
            </p>
            <p className="mt-2 text-muted-foreground">
              We also collect usage data automatically: browser type, device
              information, pages visited, and interaction patterns within the
              platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              3. How We Use Your Information
            </h2>
            <p className="mt-2 text-muted-foreground">
              We use your information to provide and improve the CRM service,
              process transactions, send service-related communications, ensure
              platform security, and comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              4. WhatsApp Business Data
            </h2>
            <p className="mt-2 text-muted-foreground">
              When you connect your WhatsApp Business account, we process
              message data on your behalf as a data processor. Your WhatsApp
              conversations and contacts are stored securely and are only
              accessible within your account. We do not share your WhatsApp data
              with other customers or third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Data Security</h2>
            <p className="mt-2 text-muted-foreground">
              We implement industry-standard security measures including
              encryption at rest and in transit, role-based access controls, and
              regular security audits. However, no method of electronic
              transmission is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Data Retention</h2>
            <p className="mt-2 text-muted-foreground">
              We retain your data for as long as your account is active. If you
              delete your account, we remove your personal data within 30 days,
              except where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Third-Party Services</h2>
            <p className="mt-2 text-muted-foreground">
              We use Supabase for database and authentication, and Meta
              WhatsApp Business API for messaging. Each service has its own
              privacy policy governing data handling.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Your Rights</h2>
            <p className="mt-2 text-muted-foreground">
              You can access, update, or delete your personal information from
              your account settings. For additional requests, contact our
              support team.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Changes</h2>
            <p className="mt-2 text-muted-foreground">
              We may update this policy from time to time. Significant changes
              will be communicated via email or platform notification.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Contact</h2>
            <p className="mt-2 text-muted-foreground">
              For privacy-related questions, contact us through our support
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
