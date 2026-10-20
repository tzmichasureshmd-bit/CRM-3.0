import { AdminUsersPage } from "@/app/admin/users/page";

export const dynamic = "force-dynamic";

export default async function SuperAdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <AdminUsersPage basePath="/super-admin" searchParams={searchParams} />;
}
