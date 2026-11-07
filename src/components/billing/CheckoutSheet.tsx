/** Subscribe popup: Kashier Direct API (card / Vodafone Cash, EGP) in Egypt, Dodo elsewhere, Google Play on Android. */
import { useEffect, useState } from "react";
import { Loader2, Lock, X, CheckCircle2, CreditCard, Smartphone, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/legacyClient";
import { playProductId, priceOf, type BillingInterval, type Tier } from "@/lib/payments/plans";
import { CREDITS_CHANGED_EVENT } from "@/hooks/useCredits";
import "@/styles/checkout-sheet.css";

type PlayApi = { purchase?: (json: string) => void };
declare global { interface Window { ceyoPlayPurchase?: (token: string) => void } }
const playApi = () => (typeof window !== "undefined" ? ((window as unknown as { MegsyAndroid?: PlayApi }).MegsyAndroid ?? null) : null);
type Quote = { country: string; provider: "kashier" | "dodo"; methods: string[]; amount: number; currency: string };

async function billing<T = Record<string, unknown>>(body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Payment could not start");
  return json as T;
}

const money = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: currency === "EGP" ? 0 : 2 }).format(amount); }
  catch { return `${amount} ${currency}`; }
};
const digits = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);

export function CheckoutSheet({ tier, name, interval, onClose }: { tier: Tier; name: string; interval: BillingInterval; onClose: () => void }) {
  const usd = priceOf(tier, interval) ?? 0;
  const native = playApi();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState<"card" | "wallet">("card");
  const [card, setCard] = useState({ number: "", name: "", exp: "", cvv: "" });
  const [phone, setPhone] = useState("");
  const [frame, setFrame] = useState("");
  const [orderId, setOrderId] = useState("");
  const [check, setCheck] = useState<"" | "db" | "wallet" | "dodo">("");
  const [state, setState] = useState<"idle" | "loading" | "waiting" | "paid" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (native) return;
    billing<Quote>({ action: "quote", tier, interval, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "" })
      .then(setQuote).catch((e) => setError((e as Error).message));
  }, [tier, interval, native]);

  const done = () => { setState("paid"); window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT)); };

  // Only the server (verified webhook, wallet reconcile or Dodo lookup) can mark the order paid.
  useEffect(() => {
    if (!orderId || state !== "waiting") return;
    const t = setInterval(async () => {
      let status = "";
      if (check === "wallet") status = (await billing<{ status: string }>({ action: "kashier_wallet_check", orderId }).catch(() => ({ status: "" }))).status;
      else if (check === "dodo") status = (await billing<{ status: string }>({ action: "dodo_check", orderId }).catch(() => ({ status: "" }))).status;
      else status = (await supabase.from("payment_orders").select("status").eq("id", orderId).maybeSingle()).data?.status ?? "";
      if (status === "paid") done();
      if (status === "failed") { setState("error"); setError("The payment was declined."); setFrame(""); }
    }, 4000);
    return () => clearInterval(t);
  }, [orderId, state, check]);

  const fail = (e: unknown) => { setState("error"); setError((e as Error).message); };

  const payPlay = async () => {
    setState("loading");
    const { data } = await supabase.auth.getUser();
    window.ceyoPlayPurchase = async (token) => {
      try { await billing({ action: "play", tier, interval, purchaseToken: token }); done(); } catch (e) { fail(e); }
    };
    native?.purchase?.(JSON.stringify({ productId: playProductId(tier, interval), accountId: data.user?.id }));
  };

  const payCard = async () => {
    const [mm, yy] = card.exp.split("/");
    if (card.number.length < 13 || !card.name.trim() || !mm || !yy || card.cvv.length < 3) { setError("Check your card details."); return; }
    setState("loading"); setError("");
    try {
      const o = await billing<{ orderId: string; merchantId: string; amount: number; currency: string; hash: string; endpoint: string; webhookUrl: string; redirect: string }>({ action: "kashier_card", tier, interval });
      // Card details go straight from this device to Kashier; Ceyo's servers never see them.
      const res = await fetch(o.endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Kashier-Hash": o.hash }, body: JSON.stringify({
        apiOperation: "PAY", merchantId: o.merchantId, interactionSource: "ECOMMERCE",
        paymentMethod: { type: "CARD", card: { number: card.number, nameOnCard: card.name.trim(), expiry: { month: mm, year: yy }, securityCode: card.cvv, enable3DS: true } },
        order: { reference: o.orderId, amount: String(o.amount), currency: o.currency, description: `Ceyo ${name} ${interval}` },
        merchantRedirect: o.redirect, serverWebhook: o.webhookUrl, reconciliation: { webhookUrl: o.webhookUrl, merchantRedirect: o.redirect, redirect: false },
      }) });
      const p = await res.json().catch(() => ({}));
      const url = p?.response?.authentication?.redirectUrl;
      setOrderId(o.orderId); setCheck("db");
      if (url && /^https:\/\/([a-z0-9-]+\.)*kashier\.io\//.test(url)) { setFrame(url); setState("waiting"); return; }
      if (p?.status === "SUCCESS") { setState("waiting"); return; }
      throw new Error(p?.messages?.en || p?.message || "The card was declined.");
    } catch (e) { fail(e); }
  };

  const payWallet = async () => {
    setState("loading"); setError("");
    try {
      const o = await billing<{ orderId: string }>({ action: "kashier_wallet", tier, interval, phone });
      setOrderId(o.orderId); setCheck("wallet"); setState("waiting");
    } catch (e) { fail(e); }
  };

  const payDodo = async () => {
    setState("loading"); setError("");
    try {
      const o = await billing<{ orderId: string; url: string }>({ action: "dodo", tier, interval, country: quote?.country ?? "" });
      setOrderId(o.orderId); setCheck("dodo"); setState("waiting");
      window.open(o.url, "_blank", "noopener");
      setFrame(o.url);
    } catch (e) { fail(e); }
  };

  const total = native ? `$${usd}` : quote ? money(quote.amount, quote.currency) : "…";
  const busy = state === "loading";

  return (
    <div className="ck-scrim" role="presentation" onClick={onClose}>
      <section className="ck-sheet" role="dialog" aria-modal="true" aria-label="Subscribe" onClick={(e) => e.stopPropagation()}>
        <header className="ck-head">
          <h2>{state === "paid" ? "You're all set" : `Subscribe to Ceyo ${name}`}</h2>
          <button type="button" className="ck-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>

        {state === "paid" ? (
          <div className="ck-done"><CheckCircle2 size={44} /><p>Ceyo {name} is now active.</p><button type="button" className="ck-cta" onClick={onClose}>Done</button></div>
        ) : state === "waiting" && check === "wallet" ? (
          <div className="ck-wait"><Loader2 size={28} className="animate-spin" /><p>Approve the payment request on your phone ({phone}).</p><small>This page updates by itself.</small></div>
        ) : state === "waiting" && check === "dodo" ? (
          <div className="ck-wait"><Loader2 size={28} className="animate-spin" /><p>Finish paying in the secure page that opened.</p>
            <a className="ck-link" href={frame} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open payment page again</a></div>
        ) : state === "waiting" && frame ? (
          <iframe className="ck-frame" src={frame} title="Card verification" />
        ) : state === "waiting" ? (
          <div className="ck-wait"><Loader2 size={28} className="animate-spin" /><p>Confirming your payment…</p></div>
        ) : (
          <>
            <div className="ck-summary">
              <div><strong>Ceyo {name}</strong><small>{interval === "yearly" ? "Billed yearly" : "Billed monthly"}</small></div>
              <b>{total}</b>
            </div>

            {!native && quote?.provider === "kashier" && (
              <>
                <div className="ck-tabs" role="tablist">
                  <button type="button" role="tab" aria-selected={method === "card"} onClick={() => setMethod("card")}><CreditCard size={16} /> Card</button>
                  <button type="button" role="tab" aria-selected={method === "wallet"} onClick={() => setMethod("wallet")}><Smartphone size={16} /> Vodafone Cash</button>
                </div>
                {method === "card" ? (
                  <div className="ck-form">
                    <input inputMode="numeric" autoComplete="cc-number" placeholder="Card number" value={card.number.replace(/(\d{4})(?=\d)/g, "$1 ")} onChange={(e) => setCard({ ...card, number: digits(e.target.value, 19) })} />
                    <input autoComplete="cc-name" placeholder="Name on card" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value.slice(0, 60) })} />
                    <div className="ck-row">
                      <input inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp} onChange={(e) => { const d = digits(e.target.value, 4); setCard({ ...card, exp: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }); }} />
                      <input inputMode="numeric" autoComplete="cc-csc" placeholder="CVV" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: digits(e.target.value, 4) })} />
                    </div>
                  </div>
                ) : (
                  <div className="ck-form">
                    <input inputMode="tel" placeholder="Wallet number (01xxxxxxxxx)" value={phone} onChange={(e) => setPhone(digits(e.target.value, 11))} />
                  </div>
                )}
              </>
            )}

            {!native && quote?.provider === "dodo" && (
              <div className="ck-methods">{quote.methods.map((m) => <span key={m}>{m}</span>)}</div>
            )}

            {error && <p className="ck-error" role="alert">{error}</p>}
            <button type="button" className="ck-cta" disabled={busy || (!native && !quote)}
              onClick={() => void (native ? payPlay() : quote?.provider === "kashier" ? (method === "card" ? payCard() : payWallet()) : payDodo())}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : native ? "Subscribe with Google Play" : `Subscribe · ${total}`}
            </button>
            <p className="ck-note"><Lock size={12} /> {native ? "Billed through your Google Play account." : quote?.provider === "dodo" ? "Secure payment by Dodo Payments. Cancel anytime." : "Card details go directly to Kashier and are never stored by Ceyo."}</p>
          </>
        )}
      </section>
    </div>
  );
}
