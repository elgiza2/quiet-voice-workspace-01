/** Subscribe popup: Kashier Direct API (card / Vodafone Cash, EGP) in Egypt, Dodo elsewhere, Google Play on Android. */
import { useEffect, useState } from "react";
import { Loader2, Lock, CheckCircle2, ExternalLink, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/legacyClient";
import { playProductId, priceOf, type BillingInterval, type Tier } from "@/lib/payments/plans";
import { CREDITS_CHANGED_EVENT } from "@/hooks/useCredits";
import { Button } from "@/components/ui/button";
import { PaymentGatewaySheet, PaymentMethodMark } from "./PaymentGatewaySheet";
import { useUserLang } from "@/lib/authI18n";
import "@/styles/subscriptions.css";
import "@/styles/checkout-sheet.css";
import checkoutArt from "@/assets/ceyo-checkout-coat.png.asset.json";
import { isPlayApp, purchasePlay } from "@/lib/native/playBilling";

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
  const ar = useUserLang().startsWith("ar");
  const [stage, setStage] = useState<"methods" | "details">("details");
  const native = playApi();
  const playNative = isPlayApp();
  const androidBilling = playNative || !!native;
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
    const previous = document.body.style.overflow;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    const previousFocus = document.activeElement;
    const dialog = document.querySelector<HTMLElement>(".ck-sheet");
    dialog?.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input, a[href], iframe"));
      const first = items[0], last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {e.preventDefault(); last.focus();}
      else if (!e.shiftKey && document.activeElement === last) {e.preventDefault(); first.focus();}
    };
    document.addEventListener("keydown", onTab);
    return () => {document.body.style.overflow = previous;document.removeEventListener("keydown",onKey);document.removeEventListener("keydown",onTab);if (previousFocus instanceof HTMLElement) previousFocus.focus();};
  }, [onClose]);

  useEffect(() => {
    if (androidBilling) return;
    billing<Quote>({ action: "quote", tier, interval, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "" })
      .then(setQuote).catch((e) => setError((e as Error).message));
  }, [tier, interval, androidBilling]);

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
    if (playNative) {
      try {
        if (!data.user) throw new Error("Please sign in first");
        const token = await purchasePlay(playProductId(tier, interval), data.user.id);
        await billing({ action: "play", tier, interval, purchaseToken: token });
        done();
      } catch (e) { fail(e); }
      return;
    }
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

  const total = androidBilling ? `$${usd}` : quote ? money(quote.amount, quote.currency) : "…";
  const busy = state === "loading";

  return (
    <div dir={ar ? "rtl" : "ltr"} className={`ck-scrim ${stage === "details" ? "ck-details-scrim" : ""}`} role="presentation" onClick={onClose}>
      <section className={`ck-sheet ${stage === "details" ? "ck-details" : ""}`} role="dialog" aria-modal="true" aria-label={ar ? "اشترك" : "Subscribe"} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        {stage === "details" && <div className="ck-art" aria-hidden="true"><img src={checkoutArt.url} alt=""/><div/></div>}
        <div className="ck-grabber" aria-hidden="true"><i/></div>
        <header className="ck-head">
          {stage === "details" && state !== "paid" && <Button variant="ghost" size="icon" className="ck-back" aria-label={ar ? "رجوع" : "Back"} onClick={onClose}><ChevronLeft/></Button>}
          <h2>{state === "paid" ? ar ? "تم الاشتراك" : "Payment complete" : stage === "methods" && !androidBilling ? ar ? "طريقة الدفع" : "Choose payment method" : ar ? "الدفع" : "Payment"}</h2>
          {stage === "methods" && <p>{ar ? "اختار طريقة الدفع اللي تناسبك." : "Pick an option."}</p>}
        </header>

        {state === "paid" ? (
          <div className="ck-done"><CheckCircle2 size={44} /><p>Ceyo {name} is now active.</p><Button variant="ghost" type="button" className="ck-cta" onClick={onClose}>Done</Button></div>
        ) : state === "waiting" && check === "wallet" ? (
          <div className="ck-wait"><Loader2 size={28} className="animate-spin" /><p>Approve the payment request on your phone ({phone}).</p><small>This page updates by itself.</small></div>
        ) : state === "waiting" && check === "dodo" ? (
          <div className="ck-wait"><Loader2 size={28} className="animate-spin" /><p>Finish paying in the secure page that opened.</p>
            <a className="ck-link" href={frame} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open payment page again</a></div>
        ) : state === "waiting" && frame ? (
          <iframe className="ck-frame" src={frame} title="Card verification" />
        ) : state === "waiting" ? (
          <div className="ck-wait"><Loader2 size={28} className="animate-spin" /><p>Confirming your payment…</p></div>
        ) : stage === "methods" && !androidBilling ? (
          <>{error && <p className="ck-error" role="alert">{error}</p>}<PaymentGatewaySheet provider={quote?.provider} methods={quote?.methods ?? []} loading={!quote && !error} ar={ar} onCancel={onClose} onSelect={(selected) => {setMethod(selected);setError("");if (quote?.provider === "dodo") {void payDodo();} else setStage("details");}}/>{error && !quote && <Button variant="ghost" className="ck-cta" onClick={() => {setError("");void billing<Quote>({action:"quote",tier,interval,tz:Intl.DateTimeFormat().resolvedOptions().timeZone}).then(setQuote).catch(fail);}}>Retry</Button>}</>
        ) : (
          <>
            {!androidBilling && quote?.provider === "kashier" && (
              <>
                <div className="ck-method-tabs" role="tablist" aria-label="Payment method">{(["card", "wallet"] as const).map((m) => <Button variant="ghost" role="tab" aria-selected={method === m} key={m} onClick={() => {setMethod(m);setError("");}}><PaymentMethodMark method={m}/><span>{m === "card" ? ar ? "بطاقة" : "Card" : "Vodafone Cash"}</span></Button>)}</div>
                {method === "card" ? (
                  <div className="ck-form">
                    <label><span>{ar ? "رقم البطاقة" : "Card number"}</span><input dir="ltr" inputMode="numeric" autoComplete="cc-number" aria-label="Card number" placeholder="1234 5678 9012 3456" value={card.number.replace(/(\d{4})(?=\d)/g, "$1 ")} onChange={(e) => setCard({ ...card, number: digits(e.target.value, 19) })} /></label>
                    <label><span>{ar ? "الاسم على البطاقة" : "Name on card"}</span><input autoComplete="cc-name" aria-label="Name on card" placeholder="Full name" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value.slice(0, 60) })} /></label>
                    <div className="ck-row">
                      <label><span>{ar ? "تاريخ الانتهاء" : "Expiry"}</span><input dir="ltr" inputMode="numeric" autoComplete="cc-exp" aria-label="Expiry date" placeholder="MM/YY" value={card.exp} onChange={(e) => { const d = digits(e.target.value, 4); setCard({ ...card, exp: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }); }} /></label>
                      <label><span>CVV</span><input dir="ltr" inputMode="numeric" autoComplete="cc-csc" aria-label="CVV" type="password" placeholder="CVV" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: digits(e.target.value, 4) })} /></label>
                    </div>
                  </div>
                ) : (
                  <div className="ck-form">
                    <label><span>{ar ? "رقم المحفظة" : "Wallet number"}</span><input dir="ltr" inputMode="tel" aria-label="Vodafone Cash number" placeholder="Wallet number (01xxxxxxxxx)" value={phone} onChange={(e) => setPhone(digits(e.target.value, 11))} /></label>
                  </div>
                )}
              </>
            )}

            {!androidBilling && quote?.provider === "dodo" && (
              <div className="ck-methods">{quote.methods.map((m) => <span key={m}>{m}</span>)}</div>
            )}

            {error && <p className="ck-error" role="alert">{error}</p>}
            <Button variant="ghost" type="button" className="ck-cta" disabled={busy || (!androidBilling && !quote)}
              onClick={() => void (androidBilling ? payPlay() : quote?.provider === "kashier" ? (method === "card" ? payCard() : payWallet()) : payDodo())}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : androidBilling ? "Subscribe with Google Play" : `${ar ? "اشترك" : "Subscribe"} · ${total}`}
            </Button>
            <p className="ck-note"><Lock size={12} /><span>{androidBilling ? "Billed through your Google Play account." : quote?.provider === "dodo" ? "Secure payment by Dodo Payments. Cancel anytime." : method === "wallet" ? "Approve the payment request on your phone." : "Card details go directly to Kashier and are never stored by Ceyo."}</span></p>
          </>
        )}
      </section>
    </div>
  );
}
