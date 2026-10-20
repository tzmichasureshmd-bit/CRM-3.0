// ============================================================
// Lead-notification email sending (Resend REST API, no deps).
//
// Server-only. The Resend API key lives in RESEND_API_KEY (env).
// Every lead email is a branded HTML build of the same template
// so recipient 1 and recipient 2 (and the test email) see the
// same professional look.
// ============================================================

export interface LeadEmailPayload {
  leadName: string;
  phone: string;
  email: string;
  customer: string;
  sourceLabel: string;
  stageName: string;
  agentName: string;
  createdAt: string;
  progress: number;
  dealId: string;
  baseUrl: string;
}

export interface EmailSendResult {
  ok: boolean;
  to: string;
  status?: number;
  error?: string;
}

// -------------------------------------------------------------
// Env / endpoint resolution
// -------------------------------------------------------------

export function resendApiKey(): string | null {
  return process.env.RESEND_API_KEY ?? null;
}

export function resolveBaseUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, "https://"),
    process.env.VERCEL_URL?.replace(/^https?:\/\//, "https://"),
  ];
  return candidates.find((c): c is string => !!c && c.length > 0) ?? "";
}

// -------------------------------------------------------------
// Branded HTML template
// -------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildLeadNotificationEmail(
  payload: LeadEmailPayload,
): { subject: string; html: string } {
  const subject = `New Lead Received — ${escapeHtml(payload.leadName) || "Tzmicha CRM"}`;
  const link = `${escapeHtml(payload.baseUrl)}/super-admin/leads?lead=${payload.dealId}`;
  const progressPct = Math.max(0, Math.min(100, payload.progress));
  const createdHuman = new Date(payload.createdAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 24px;font-size:13px;color:#a1a1aa;border-bottom:1px solid #232329;width:40%">${label}</td>
      <td style="padding:10px 24px;font-size:13px;color:#fafafa;border-bottom:1px solid #232329">${value}</td>
    </tr>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      @media (prefers-color-scheme: dark) {
        body { background-color: #0b0b0f !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#0b0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:#131318;border:1px solid #26262e;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:28px 24px 0 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                    <tr>
                      <td style="border-radius:10px;background-color:#10b981;padding:10px 14px;font-size:18px;font-weight:800;color:#052e22;line-height:1">T</td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align:middle;font-size:11px;letter-spacing:1px;color:#71717a;text-transform:uppercase">Tzmicha CRM &middot; Lead Alert</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 24px 8px 24px;">
            <h1 style="margin:0;font-size:24px;line-height:1.3;color:#ffffff;font-weight:700">New Lead Received</h1>
            <p style="margin:8px 0 0 0;font-size:14px;color:#a1a1aa;line-height:1.5">A new lead landed in the Tzmicha platform. The team may be fast asleep — this is your heads-up.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${row("Lead", `<b style="color:#ffffff">${escapeHtml(payload.leadName) || "—"}</b>`)}
              ${row("Phone", escapeHtml(payload.phone) || "—")}
              ${row("Email", escapeHtml(payload.email) || "—")}
              ${row("Customer", escapeHtml(payload.customer) || "—")}
              ${row("Lead Source", escapeHtml(payload.sourceLabel) || "—")}
              ${row("Current Stage", escapeHtml(payload.stageName) || "—")}
              ${row("Assigned Agent", escapeHtml(payload.agentName) || "Unassigned")}
              ${row("Received", escapeHtml(createdHuman) || "—")}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px 0 24px;">
            <div style="height:6px;border-radius:9999px;background-color:#232329;overflow:hidden;">
              <div style="height:100%;width:${progressPct}%;background-color:#10b981;border-radius:9999px;"></div>
            </div>
            <p style="margin:8px 0 0 0;font-size:12px;color:#71717a">Pipeline progression <b style="color:#a1a1aa">${progressPct}%</b></p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td>
                  <a href="${link}" style="display:inline-block;background-color:#10b981;color:#052e22;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:10px;">Open lead in Super Admin</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px 24px;border-top:1px solid #232329;">
            <p style="font-size:12px;color:#71717a;line-height:1.5;margin:16px 0 0 0">Tzmicha Platform &middot; Automated notification. No reply needed — reply to this email and it goes nowhere.</p>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;

  return { subject, html };
}

// -------------------------------------------------------------
// Send via Resend
// -------------------------------------------------------------

export async function sendLeadEmail(opts: {
  fromName: string;
  fromEmail: string;
  to: string | string[];
  payload: LeadEmailPayload;
}): Promise<EmailSendResult> {
  const key = resendApiKey();
  if (!key) {
    return {
      ok: false,
      to: Array.isArray(opts.to) ? opts.to.join(",") : opts.to,
      error: "RESEND_API_KEY is not configured on the server",
    };
  }

  const { subject, html } = buildLeadNotificationEmail(opts.payload);

  const body = {
    from: `${opts.fromName} <${opts.fromEmail}>`,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject,
    html,
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        to: body.to.join(","),
        status: res.status,
        error: text || `Resend returned HTTP ${res.status}`,
      };
    }

    return { ok: true, to: body.to.join(","), status: res.status };
  } catch (err) {
    return {
      ok: false,
      to: body.to.join(","),
      error: err instanceof Error ? err.message : "Unknown send error",
    };
  }
}

// -------------------------------------------------------------
// Test-email payload (deterministic sample, clearly labelled)
// -------------------------------------------------------------

export function buildTestEmailPayload(baseUrl: string): LeadEmailPayload {
  return {
    leadName: "Sample Customer",
    phone: "+1 555 0100 1234",
    email: "sample.customer@example.com",
    customer: "Acme Real Estate LLC",
    sourceLabel: "WhatsApp",
    stageName: "New Lead",
    agentName: "Sales Agent",
    createdAt: new Date().toISOString(),
    progress: 20,
    dealId: "test",
    baseUrl,
  };
}