import Link from "next/link";
import type { Metadata } from "next";
import { MessageSquare, Mail, HelpCircle, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with TZmicha WhatsApp CRM. Find answers to common questions or contact our support team.",
  robots: { index: true, follow: true },
};

export default function SupportPage() {
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
        <h1 className="text-3xl font-bold text-foreground">Support</h1>
        <p className="mt-2 text-muted-foreground">
          Need help with your WhatsApp CRM? We&apos;re here for you.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Email Support
              </CardTitle>
              <CardDescription>
                Send us an email and we&apos;ll respond within 24 hours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href="mailto:support@tzmicha.com"
                className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80"
              >
                support@tzmicha.com
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                Help Center
              </CardTitle>
              <CardDescription>
                Browse guides and tutorials for using the CRM.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Coming soon. In the meantime, contact us via email.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12">
          <h2 className="mb-6 text-xl font-semibold text-foreground">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {[
              {
                q: "How do I connect my WhatsApp Business account?",
                a: "Go to Settings → WhatsApp in your CRM dashboard. Follow the setup instructions to enter your Meta API credentials and register your phone number.",
              },
              {
                q: "How do I import contacts?",
                a: "Go to Contacts → Import. Upload a CSV file with a phone column. You can also include name, email, company, and tags.",
              },
              {
                q: "How do I invite team members?",
                a: "Go to Settings → Team Members → Invite Member. Enter their email, choose a role, and share the generated link.",
              },
              {
                q: "How do I create a campaign?",
                a: "Go to Broadcasts → New Broadcast. Choose a template, select your audience, personalize variables, and send.",
              },
              {
                q: "How do I upgrade my plan?",
                a: "Go to Plans & Billing in your sidebar. Choose a new plan and follow the payment process.",
              },
              {
                q: "How do I reset my password?",
                a: "Go to the login page and click 'Forgot password'. You'll receive a reset link via email.",
              },
            ].map((item) => (
              <Card key={item.q} className="border-border bg-card">
                <CardContent className="pt-6">
                  <h3 className="font-medium text-foreground">{item.q}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.a}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
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
