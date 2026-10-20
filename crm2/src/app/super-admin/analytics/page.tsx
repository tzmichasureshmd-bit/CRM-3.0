import { AdminAnalyticsPage } from "@/app/admin/analytics/page";

/** Shared page rendered under the /super-admin prefix. */
export default function SuperAdminAnalyticsPage() {
  return <AdminAnalyticsPage basePath="/super-admin" />;
}
