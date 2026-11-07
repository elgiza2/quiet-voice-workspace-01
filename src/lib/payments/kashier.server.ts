/** Server-only Kashier: server-priced hosted checkout + signed webhook verification. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getProviderKey } from "@/lib/keys/providerKey";
import { priceOf } from "./plans";

export class PaymentsUnavailable extends Error {}
const db = () => supabaseAdmin as any;

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function keys() {
  const [merchantId, apiKey] = await Promise.all([getProviderKey("kashier_merchant_id"), getProviderKey("kashier_api_key")]);
  if (!merchantId || !apiKey) throw new PaymentsUnavailable("Kashier is not configured");
  return { merchantId: merchantId.trim(), apiKey: apiKey.trim() };
}

/** Create a pending order priced on the server and return Kashier's hosted checkout URL. */
export async function createKashierCheckout(userId: string, tier: string, interval: string, origin: string, lang: "ar" | "en") {
  const amount = priceOf(tier, interval);
  if (amount === null) throw new Error("This plan is not available");
  const { merchantId, apiKey } = await keys();
  const currency = (process.env.KASHIER_CURRENCY || "USD").toUpperCase();
  const orderId = `ceyo_${crypto.randomUUID().replace(/-/g, "")}`;
  const { error } = await db().from("payment_orders").insert({ id: orderId, user_id: userId, tier, interval, amount, currency, provider: "kashier" });
  if (error) throw new Error(error.message);
  const hash = await hmacHex(apiKey, `/?payment=${merchantId}.${orderId}.${amount}.${currency}`);
  const mode = (process.env.KASHIER_MODE || "live").toLowerCase() === "test" ? "test" : "live";
  const params = new URLSearchParams({
    merchantId, orderId, amount: String(amount), currency, hash, mode,
    merchantRedirect: `${origin}/settings/plans?order=${orderId}`,
    serverWebhook: `${origin}/api/public/kashier-webhook`,
    display: lang, allowedMethods: "card,wallet", defaultMethod: "card", type: "external", brandColor: "#000000",
  });
  return { orderId, amount, currency, url: `https://checkout.kashier.io/?${params}` };
}

/** Verify Kashier's x-kashier-signature (HMAC over sorted signatureKeys) and settle the order once. */
export async function handleKashierWebhook(raw: string, signature: string) {
  const { apiKey } = await keys();
  const event = JSON.parse(raw) as { event?: string; data?: Record<string, unknown> };
  const data = event.data ?? {};
  const signed = Array.isArray(data.signatureKeys) ? (data.signatureKeys as unknown[]).filter((k): k is string => typeof k === "string").sort() : [];
  if (!signed.length || !signature) return { ok: false as const, status: 401 };
  const pairs = signed.map((k) => [k, String(data[k] ?? "")] as const);
  const candidates = [pairs.map(([k, v]) => `${k}=${v}`).join("&"), pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")];
  let valid = false;
  for (const c of candidates) if (safeEqual(await hmacHex(apiKey, c), signature.toLowerCase())) valid = true;
  if (!valid) return { ok: false as const, status: 401 };

  const orderId = String(data.merchantOrderId ?? "");
  const status = String(data.status ?? "").toUpperCase();
  const ref = String(data.transactionId ?? data.kashierOrderId ?? orderId);
  const { data: order } = await db().from("payment_orders").select("id,amount,currency,status").eq("id", orderId).maybeSingle();
  if (!order) return { ok: true as const, status: 200 };
  if (status === "SUCCESS") {
    // Amount/currency must match the server-priced order exactly.
    if (Number(data.amount) !== Number(order.amount) || String(data.currency ?? "").toUpperCase() !== order.currency) {
      await db().from("payment_orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
      return { ok: true as const, status: 200 };
    }
    await db().rpc("settle_payment_order", { p_order: orderId, p_ref: ref });
  } else if (status === "FAILURE" || status === "FAILED") {
    await db().from("payment_orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
  }
  return { ok: true as const, status: 200 };
}
