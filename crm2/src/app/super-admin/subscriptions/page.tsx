import { AdminSubscriptionsPage } from "@/app/admin/subscriptions/page";

export const dynamic = "force-dynamic";

export default async function SuperAdminSubscriptionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <AdminSubscriptionsPage
      basePath="/super-admin"
      searchParams={searchParams}
    />
  );
}
