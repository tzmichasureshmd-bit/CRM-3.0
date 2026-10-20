import { AdminPaymentsPage } from "@/app/super-admin/payments/page";

export const dynamic = "force-dynamic";

export default async function AdminTreePaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <AdminPaymentsPage basePath="/admin" searchParams={searchParams} />;
}
