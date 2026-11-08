import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import type { UsageStatus } from "./usage";
export const getUsageStatus = createServerFn({ method: "POST" }).handler(async (): Promise<UsageStatus> => {
  const { authenticate } = await import("./auth.server");
  const { db } = await authenticate(getRequest());
  setResponseHeader("Cache-Control", "no-store");
  const { data, error } = await db.rpc("agent_usage_status");
  if (error || !data) throw new Error("Could not load usage. Please try again.");
  return { plan: String(data.plan), isPaid: data.isPaid === true, allowanceUsd: Number(data.allowanceUsd), spentUsd: Number(data.spentUsd), remainingUsd: Number(data.remainingUsd), stepUsd: Number(data.stepUsd) };
});