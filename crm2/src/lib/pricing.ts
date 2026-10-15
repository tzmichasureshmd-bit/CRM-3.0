import type { SubscriptionPlan } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole, serviceRoleClient } from "@/lib/supabase/admin";

/**
 * Loads the active plan catalog for the public pricing page.
 *
 * `subscription_plans` is readable by authenticated users (and super
 * admins), which means a signed-out visitor gets zero rows from the
 * cookie-bound client. When that happens we retry with the service-role
 * client, which bypasses RLS — the table only holds publishable plan
 * definitions (name, price, limits), never account data. Returns an empty
 * list when neither client can read the catalog, so the page can fall back
 * to a contact-sales message instead of rendering blank cards.
 */
export async function loadPublicPlans(): Promise<SubscriptionPlan[]> {
  const query = (db: Awaited<ReturnType<typeof createClient>>) =>
    db
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

  const cookieClient = await createClient();
  const { data } = await query(cookieClient);
  if (data && data.length > 0) return data as SubscriptionPlan[];

  if (hasServiceRole()) {
    const { data: rows } = await query(serviceRoleClient());
    if (rows && rows.length > 0) return rows as SubscriptionPlan[];
  }

  return [];
}
