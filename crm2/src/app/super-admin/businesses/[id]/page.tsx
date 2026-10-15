import { AdminBusinessDetailPage } from "@/app/admin/businesses/[id]/page";

export const dynamic = "force-dynamic";

export default async function SuperAdminBusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <AdminBusinessDetailPage params={params} basePath="/super-admin" />
  );
}
