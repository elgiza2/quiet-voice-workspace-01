import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("kashier"), tier: z.enum(["plus", "pro", "ultra"]), interval: z.enum(["monthly", "yearly"]), lang: z.enum(["ar", "en"]).default("en") }),
  z.object({ action: z.literal("play"), tier: z.enum(["plus", "pro", "ultra"]), interval: z.enum(["monthly", "yearly"]), purchaseToken: z.string().min(10).max(4096) }),
]);

/** Signed-in billing: start a Kashier checkout (web) or verify a Google Play purchase (Android). */
export const Route = createFileRoute("/api/billing")({ server: { handlers: {
  POST: async ({ request }) => {
    const { authenticate } = await import("@/lib/ceyo/auth.server");
    const auth = await authenticate(request).catch(() => null);
    if (!auth) return new Response("Unauthorized", { status: 401 });
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response("Invalid request", { status: 400 });
    const { PaymentsUnavailable, createKashierCheckout } = await import("@/lib/payments/kashier.server");
    try {
      const input = parsed.data;
      if (input.action === "kashier") {
        const origin = new URL(request.url).origin;
        return Response.json(await createKashierCheckout(auth.userId, input.tier, input.interval, origin, input.lang));
      }
      const { verifyPlayPurchase } = await import("@/lib/payments/googlePlay.server");
      return Response.json(await verifyPlayPurchase(auth.userId, input.tier, input.interval, input.purchaseToken));
    } catch (e) {
      const off = e instanceof PaymentsUnavailable;
      return Response.json({ error: off ? "Payments are not available right now" : (e as Error).message.slice(0, 200) }, { status: off ? 503 : 400, headers: { "cache-control": "no-store" } });
    }
  },
} } });
