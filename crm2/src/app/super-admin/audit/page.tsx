import { AdminAuditPage } from "@/app/admin/audit/page";

export const dynamic = "force-dynamic";

export default async function SuperAdminAuditPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <AdminAuditPage basePath="/super-admin" searchParams={searchParams} />;
}
