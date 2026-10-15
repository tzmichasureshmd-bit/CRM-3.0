import { AdminAutomationsPage } from "@/app/admin/automations/page";

export const dynamic = "force-dynamic";

export default async function SuperAdminAutomationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  return (
    <AdminAutomationsPage basePath="/super-admin" searchParams={searchParams} />
  );
}
