// Server-only module. Reads SUPER_ADMIN_EMAILS env var (comma-separated).
// Never import in client components.

export function getAuthorizedSuperAdminEmails(): string[] {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "";
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isAuthorizedSuperAdmin(email: string): boolean {
  const emails = getAuthorizedSuperAdminEmails();
  return emails.includes(email.trim().toLowerCase());
}
