import Link from 'next/link';

export const metadata = { title: 'Terms & Conditions — TZMICHA CRM' };

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#eef2ff', padding: '40px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: 'rgba(255,255,255,0.96)', borderRadius: 20, padding: '40px 48px', boxShadow: '0 8px 32px rgba(64,72,120,0.10)', border: '1px solid rgba(130,145,190,0.18)' }}>
        <div style={{ marginBottom: 32 }}>
          <Link href="/" style={{ fontSize: 13, color: '#4f6df5', textDecoration: 'none', fontWeight: 500 }}>← Back</Link>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 750, color: '#101936', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Terms &amp; Conditions</h1>
        <p style={{ fontSize: 13, color: '#8790aa', margin: '0 0 32px' }}>Effective date: 1 January 2025 · Last updated: 19 October 2026</p>

        {[
          {
            title: '1. Acceptance of Terms',
            body: 'By accessing or using TZMICHA CRM 3.0 ("the Service"), you agree to be bound by these Terms & Conditions. If you do not agree, do not use the Service.',
          },
          {
            title: '2. Description of Service',
            body: 'TZMICHA CRM 3.0 is a customer relationship management platform that provides tools for managing contacts, deals, conversations, social media integrations, AI-assisted workflows, and related business functions.',
          },
          {
            title: '3. Account Responsibilities',
            body: 'You are responsible for maintaining the confidentiality of your account credentials. You must not share your account with others or use the Service for unlawful purposes. You are responsible for all activity that occurs under your account.',
          },
          {
            title: '4. Social Account Integrations',
            body: 'When you connect third-party accounts (Instagram, Facebook, WhatsApp, etc.), you authorise the Service to access those accounts on your behalf using the credentials you provide. Each workspace owner is responsible for connecting their own accounts. The Service does not share your connected accounts with other workspaces.',
          },
          {
            title: '5. Data & Privacy',
            body: 'Your use of the Service is also governed by our Privacy Policy, which is incorporated into these Terms by reference. We collect and process data as described in the Privacy Policy.',
          },
          {
            title: '6. Intellectual Property',
            body: 'All content, features, and functionality of the Service are owned by TZMICHA IT Solutions and are protected by applicable intellectual property laws.',
          },
          {
            title: '7. Limitation of Liability',
            body: 'To the maximum extent permitted by law, TZMICHA IT Solutions shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.',
          },
          {
            title: '8. Termination',
            body: 'We reserve the right to suspend or terminate your access to the Service at any time for violation of these Terms or for any other reason at our discretion.',
          },
          {
            title: '9. Changes to Terms',
            body: 'We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms. We will update the effective date above when changes are made.',
          },
          {
            title: '10. Contact',
            body: 'For questions about these Terms, contact us at: support@tzmicha.com',
          },
        ].map(s => (
          <div key={s.title} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#101936', margin: '0 0 6px' }}>{s.title}</h2>
            <p style={{ fontSize: 14, color: '#334E68', lineHeight: 1.7, margin: 0 }}>{s.body}</p>
          </div>
        ))}

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid rgba(130,145,190,0.15)', display: 'flex', gap: 20, fontSize: 13 }}>
          <Link href="/privacy" style={{ color: '#4f6df5', textDecoration: 'none' }}>Privacy Policy</Link>
          <Link href="/login" style={{ color: '#4f6df5', textDecoration: 'none' }}>Back to Login</Link>
        </div>
      </div>
    </div>
  );
}
