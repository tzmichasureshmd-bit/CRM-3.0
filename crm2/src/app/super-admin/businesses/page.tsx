import { AdminBusinessesPage } from "@/app/admin/businesses/page";

export const dynamic = "force-dynamic";

export default async function SuperAdminBusinessesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  return (
    <AdminBusinessesPage basePath="/super-admin" searchParams={searchParams} />
  );
}
