import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — TZMICHA CRM' };

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#eef2ff', padding: '40px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: 'rgba(255,255,255,0.96)', borderRadius: 20, padding: '40px 48px', boxShadow: '0 8px 32px rgba(64,72,120,0.10)', border: '1px solid rgba(130,145,190,0.18)' }}>
        <div style={{ marginBottom: 32 }}>
          <Link href="/" style={{ fontSize: 13, color: '#4f6df5', textDecoration: 'none', fontWeight: 500 }}>← Back</Link>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 750, color: '#101936', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Privacy Policy</h1>
        <p style={{ fontSize: 13, color: '#8790aa', margin: '0 0 32px' }}>Effective date: 1 January 2025 · Last updated: 19 October 2026</p>

        {[
          {
            title: '1. Information We Collect',
            body: 'We collect information you provide directly (name, email, business details), information generated through your use of the Service (contacts, deals, conversations, activity logs), and technical information (IP address, browser type, device identifiers).',
          },
          {
            title: '2. Third-Party Integrations',
            body: 'When you connect social accounts (Instagram, Facebook, WhatsApp, etc.), we access data from those platforms using the credentials and permissions you grant. This data is stored in your workspace and is not shared with other workspaces or third parties except as required to operate the integration.',
          },
          {
            title: '3. How We Use Your Information',
            body: 'We use your information to provide and improve the Service, send transactional and notification emails, support AI-powered features, and comply with legal obligations. We do not sell your personal data.',
          },
          {
            title: '4. Data Retention',
            body: 'We retain your data for as long as your account is active or as needed to provide the Service. You may request deletion of your data by contacting us. Connected social account tokens are revoked and deleted when you disconnect an integration.',
          },
          {
            title: '5. Data Security',
            body: 'We implement industry-standard security measures including encryption in transit (TLS), encrypted storage of sensitive credentials, and access controls. No method of transmission over the internet is 100% secure.',
          },
          {
            title: '6. Your Rights',
            body: 'Depending on your location, you may have rights to access, correct, delete, or export your personal data. To exercise these rights, contact us at support@tzmicha.com.',
          },
          {
            title: '7. Cookies',
            body: 'We use cookies and similar technologies for authentication, session management, and analytics. You can control cookies through your browser settings.',
          },
          {
            title: '8. Children\'s Privacy',
            body: 'The Service is not directed to children under 16. We do not knowingly collect personal data from children.',
          },
          {
            title: '9. Changes to This Policy',
            body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the effective date above and, where appropriate, by email.',
          },
          {
            title: '10. Contact Us',
            body: 'For privacy-related questions or requests, contact: support@tzmicha.com · TZMICHA IT Solutions',
          },
        ].map(s => (
          <div key={s.title} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#101936', margin: '0 0 6px' }}>{s.title}</h2>
            <p style={{ fontSize: 14, color: '#334E68', lineHeight: 1.7, margin: 0 }}>{s.body}</p>
          </div>
        ))}

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid rgba(130,145,190,0.15)', display: 'flex', gap: 20, fontSize: 13 }}>
          <Link href="/terms" style={{ color: '#4f6df5', textDecoration: 'none' }}>Terms &amp; Conditions</Link>
          <Link href="/login" style={{ color: '#4f6df5', textDecoration: 'none' }}>Back to Login</Link>
        </div>
      </div>
    </div>
  );
}
