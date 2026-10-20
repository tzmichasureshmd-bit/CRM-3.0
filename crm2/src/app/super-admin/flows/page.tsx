import { AdminFlowsPage } from "@/app/admin/flows/page";

/** Shared page rendered under the /super-admin prefix. */
export default function SuperAdminFlowsPage() {
  return <AdminFlowsPage basePath="/super-admin" />;
}
