/** Complete-payment popup: Kashier hosted checkout on the web, Google Play inside the Android app. */
import { useEffect, useState } from "react";
import { Loader2, Lock, X, ExternalLink, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/legacyClient";
import { playProductId, priceOf, type BillingInterval, type Tier } from "@/lib/payments/plans";
import { CREDITS_CHANGED_EVENT } from "@/hooks/useCredits";
import "@/styles/checkout-sheet.css";

type PlayApi = { purchase?: (json: string) => void };
declare global { interface Window { ceyoPlayPurchase?: (token: string) => void } }
const playApi = () => (typeof window !== "undefined" ? ((window as unknown as { MegsyAndroid?: PlayApi }).MegsyAndroid ?? null) : null);

async function billing(body: unknown) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Payment could not start");
  return json;
}

export function CheckoutSheet({ tier, name, interval, onClose }: { tier: Tier; name: string; interval: BillingInterval; onClose: () => void }) {
  const price = priceOf(tier, interval) ?? 0;
  const native = playApi();
  const [url, setUrl] = useState("");
  const [orderId, setOrderId] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "paying" | "paid" | "error">("idle");
  const [error, setError] = useState("");

  // Watch the server-confirmed order; only the verified webhook can mark it paid.
  useEffect(() => {
    if (!orderId || state !== "paying") return;
    const t = setInterval(async () => {
      const { data } = await supabase.from("payment_orders").select("status").eq("id", orderId).maybeSingle();
      if (data?.status === "paid") { setState("paid"); window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT)); }
      if (data?.status === "failed") { setState("error"); setError("The payment was declined."); }
    }, 3000);
    return () => clearInterval(t);
  }, [orderId, state]);

  const start = async () => {
    setState("loading"); setError("");
    try {
      if (native?.purchase) {
        const { data } = await supabase.auth.getUser();
        window.ceyoPlayPurchase = async (token) => {
          try { await billing({ action: "play", tier, interval, purchaseToken: token }); setState("paid"); window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT)); }
          catch (e) { setState("error"); setError((e as Error).message); }
        };
        native.purchase(JSON.stringify({ productId: playProductId(tier, interval), accountId: data.user?.id }));
        return;
      }
      const lang = document.documentElement.lang === "ar" ? "ar" : "en";
      const r = await billing({ action: "kashier", tier, interval, lang });
      setUrl(r.url); setOrderId(r.orderId); setState("paying");
    } catch (e) { setState("error"); setError((e as Error).message); }
  };

  return (
    <div className="ck-scrim" role="presentation" onClick={onClose}>
      <section className="ck-sheet" role="dialog" aria-modal="true" aria-label="Complete payment" onClick={(e) => e.stopPropagation()}>
        <header className="ck-head">
          <h2>{state === "paid" ? "You're all set" : "Complete payment"}</h2>
          <button type="button" className="ck-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        {state === "paid" ? (
          <div className="ck-done"><CheckCircle2 size={44} /><p>Ceyo {name} is now active.</p><button type="button" className="ck-cta" onClick={onClose}>Done</button></div>
        ) : state === "paying" && url ? (
          <>
            <iframe className="ck-frame" src={url} title="Kashier secure checkout" allow="payment" />
            <a className="ck-link" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open checkout in a new tab</a>
          </>
        ) : (
          <>
            <div className="ck-summary">
              <div><strong>Ceyo {name}</strong><small>{interval === "yearly" ? "Billed yearly" : "Billed monthly"}</small></div>
              <b>${price}</b>
            </div>
            <div className="ck-total"><span>Total today</span><b>${price}</b></div>
            {error && <p className="ck-error" role="alert">{error}</p>}
            <button type="button" className="ck-cta" disabled={state === "loading"} onClick={() => void start()}>
              {state === "loading" ? <Loader2 size={18} className="animate-spin" /> : native ? "Pay with Google Play" : "Continue to payment"}
            </button>
            <p className="ck-note"><Lock size={12} /> {native ? "Billed through your Google Play account." : "Card details are entered on Kashier's secure page, never stored by Ceyo."}</p>
          </>
        )}
      </section>
    </div>
  );
}
