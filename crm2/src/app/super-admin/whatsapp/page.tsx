import { AdminWhatsappPage } from "@/app/admin/whatsapp/page";

/** Shared page rendered under the /super-admin prefix. */
export default function SuperAdminWhatsappPage() {
  return <AdminWhatsappPage basePath="/super-admin" />;
}
