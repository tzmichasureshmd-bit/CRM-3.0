import { AdminUsagePage } from "@/app/admin/usage/page";

export const dynamic = "force-dynamic";

export default async function SuperAdminUsagePage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <AdminUsagePage basePath="/super-admin" searchParams={searchParams} />;
}
