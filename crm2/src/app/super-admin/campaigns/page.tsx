import { AdminCampaignsPage } from "@/app/admin/campaigns/page";

export const dynamic = "force-dynamic";

export default async function SuperAdminCampaignsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  return (
    <AdminCampaignsPage basePath="/super-admin" searchParams={searchParams} />
  );
}
