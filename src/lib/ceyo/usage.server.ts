import { EXHAUSTED_MESSAGE } from "./usage";
/** Called only with an authenticated caller or a verified persisted job owner. */
export async function chargeUsage(userId: string, operationKey: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("charge_agent_usage", { p_user_id: userId, p_operation_key: operationKey });
  if (error) throw new Error("Could not check usage. Please try again later.");
  if (!data || typeof data !== "object" || Array.isArray(data) || !("ok" in data)) throw new Error("Could not check usage. Please try again later.");
  if (data.ok !== true) throw new Error(EXHAUSTED_MESSAGE);
}