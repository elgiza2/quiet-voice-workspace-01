/** Subscribe popup: Kashier Direct API (card / Vodafone Cash, EGP) in Egypt, Dodo elsewhere, Google Play on Android. */
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/legacyClient";
import { playProductId, priceOf, type BillingInterval, type Tier } from "@/lib/payments/plans";
import { CREDITS_CHANGED_EVENT } from "@/hooks/useCredits";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./CardPreview";
import { BRAND_MARKS } from "@/lib/payments/brandMarks";
import { useUserLang } from "@/lib/authI18n";
import "@/styles/nova-checkout.css";
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
    const dialog = document.querySelector<HTMLElement>(".megsy-checkout");
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
  const verifying = state === "waiting" && !!frame && check === "db";
  const view = verifying ? "verify" : state === "paid" ? "done" : "main";
  const kashier = quote?.provider === "kashier";
  const tiles: { id: "card" | "wallet" | "google_pay" | "more"; label: string }[] = androidBilling
    ? []
    : kashier
      ? [{ id: "card", label: ar ? "بطاقة" : "Card" }, { id: "wallet", label: "Vodafone" }]
      : quote ? [{ id: "card", label: ar ? "بطاقة" : "Card" }, { id: "google_pay", label: "Google Pay" }, { id: "more", label: ar ? "المزيد" : "More" }] : [];
  const back = () => { if (busy) return; if (state === "waiting") { setState("idle"); setFrame(""); setError(""); } else onClose(); };
  const errorBox = error ? <p role="alert" className="checkout-error">{error}</p> : null;

  return (
    <section className="botanical-pricing megsy-checkout z-[120]" data-wide={view === "verify" ? "true" : undefined} dir="ltr" role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabIndex={-1}>
      <div aria-hidden="true" className="botanical-art"><img src={checkoutArt.url} alt="" fetchPriority="high" width={768} height={1376} /></div>
      <div aria-hidden="true" className="botanical-scrim" />
      <div className="botanical-content botanical-checkout-content">
        <header className="checkout-nav">
          <Button variant="ghost" type="button" onClick={back} disabled={busy} aria-label="Back" title="Back" className="megsy-back"><ArrowLeft className="h-5 w-5" /></Button>
        </header>
        <div key={view} className="checkout-stage">
          <h1 id="checkout-title" className="checkout-title">{state === "paid" ? (ar ? "تم الاشتراك" : "Payment complete") : verifying ? (ar ? "أكّد الدفع" : "Confirm your payment") : (ar ? "الدفع" : "Payment")}</h1>
          {verifying ? (
            <div className="mt-6 flex flex-1 flex-col space-y-4">
              <p className="checkout-note">Complete your bank’s verification to finish the payment.</p>
              <div className="checkout-frame checkout-frame--verify"><iframe title="Bank verification" src={frame} allow="payment *" /></div>
            </div>
          ) : state === "paid" ? (
            <div className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                <span className="checkout-success-badge"><Check aria-hidden="true" /></span>
                <h2 className="checkout-subtitle mt-6 text-xl font-semibold">Thank you</h2>
                <p className="checkout-note mt-3">Ceyo {name} is now active.</p>
                {orderId && <p className="mt-2 max-w-full break-all font-mono text-xs text-muted-foreground">{orderId}</p>}
              </div>
              <Button variant="ghost" type="button" className="megsy-pay-cta" onClick={onClose}>Continue</Button>
            </div>
          ) : (
            <div className="checkout-allinone">
              {tiles.length > 0 && (
                <div className="checkout-methods" role="tablist" aria-label="Payment method">
                  {tiles.map((m) => {
                    const selectable = m.id === "card" || m.id === "wallet";
                    const selected = kashier && selectable && method === m.id;
                    return (
                      <Button variant="ghost" key={m.id} type="button" role="tab" aria-selected={selected} data-selected={selected} disabled={busy || state === "waiting"} className="checkout-method"
                        onClick={() => { setError(""); if (!kashier) { void payDodo(); return; } setMethod(m.id as "card" | "wallet"); }}>
                        <TileLogo id={m.id} /><span>{m.label}</span>
                      </Button>
                    );
                  })}
                </div>
              )}
              <div key={method} className="checkout-panel">
                {androidBilling ? (
                  <div className="checkout-card-form">
                    {errorBox}
                    <Button variant="ghost" type="button" data-plain disabled={busy} className="megsy-pay-cta" onClick={() => void payPlay()}>{busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing…</> : "Subscribe with Google Play"}</Button>
                    <p className="checkout-note">Billed through your Google Play account · ${usd}</p>
                  </div>
                ) : state === "waiting" ? (
                  <div className="checkout-card-form">
                    <div className="flex flex-col items-center py-6 text-center">
                      <Loader2 className="h-9 w-9 animate-spin" />
                      <h2 className="checkout-subtitle mt-4 text-lg font-semibold">{check === "wallet" ? "Approve the payment on your phone" : check === "dodo" ? "Finish paying in the secure page" : "Confirming your payment…"}</h2>
                      {check === "wallet" && <p className="checkout-note mt-2">Request sent to <span dir="ltr">{phone}</span>. Open Ana Vodafone or dial *9#, then enter your PIN.</p>}
                      {check === "dodo" && frame && <a className="checkout-note mt-2 underline" href={frame} target="_blank" rel="noopener noreferrer">Open payment page again</a>}
                      <Button variant="ghost" type="button" onClick={back} className="megsy-pay-quiet mt-4">Cancel</Button>
                    </div>
                  </div>
                ) : !quote ? (
                  <div className="checkout-card-form">
                    {errorBox ?? <p className="checkout-note flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
                    {error && <Button variant="ghost" type="button" className="megsy-pay-cta" onClick={() => { setError(""); void billing<Quote>({ action: "quote", tier, interval, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).then(setQuote).catch(fail); }}>Retry</Button>}
                  </div>
                ) : !kashier ? (
                  <div className="checkout-card-form">
                    {errorBox}
                    <Button variant="ghost" type="button" data-plain disabled={busy} className="megsy-pay-cta" onClick={() => void payDodo()}>{busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing…</> : `Pay ${total}`}</Button>
                    <p className="checkout-note">Secure payment by Dodo Payments. Cancel anytime.</p>
                  </div>
                ) : method === "card" ? (
                  <form onSubmit={(e) => { e.preventDefault(); void payCard(); }} className="checkout-card-form" autoComplete="off">
                    <Field label={ar ? "رقم البطاقة" : "Card number"}><input inputMode="numeric" autoComplete="cc-number" dir="ltr" value={card.number.replace(/(.{4})/g, "$1 ").trim()} onChange={(e) => setCard({ ...card, number: digits(e.target.value, 19) })} placeholder="1234 5678 9012 3456" /></Field>
                    <Field label={ar ? "الاسم على البطاقة" : "Name on card"}><input autoComplete="cc-name" dir="ltr" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value.slice(0, 60) })} placeholder="Full name" /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={ar ? "تاريخ الانتهاء" : "Expiry"}><input inputMode="numeric" autoComplete="cc-exp" value={card.exp.replace("/", " / ")} onChange={(e) => { const d = digits(e.target.value, 4); setCard({ ...card, exp: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }); }} placeholder="MM / YY" /></Field>
                      <Field label="CVV"><input type="password" inputMode="numeric" autoComplete="cc-csc" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: digits(e.target.value, 4) })} placeholder="•••" /></Field>
                    </div>
                    {errorBox}
                    <Button variant="ghost" type="submit" data-plain disabled={busy} className="megsy-pay-cta">{busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing…</> : `Pay now · ${total}`}</Button>
                  </form>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); void payWallet(); }} className="checkout-card-form" autoComplete="off">
                    <Field label={ar ? "رقم المحفظة" : "Wallet number"}><input inputMode="tel" autoComplete="tel-national" dir="ltr" aria-label="Vodafone Cash wallet number" value={phone} onChange={(e) => setPhone(digits(e.target.value, 11))} placeholder="01x xxxx xxxx" /></Field>
                    <p className="checkout-note">We'll send a payment request to approve on your phone.</p>
                    {errorBox}
                    <Button variant="ghost" type="submit" data-plain disabled={busy} className="megsy-pay-cta">{busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Sending…</> : "Send payment request"}</Button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="checkout-field"><span>{label}</span><div className="checkout-input-wrap">{children}</div></label>;
}

function TileLogo({ id }: { id: "card" | "wallet" | "google_pay" | "more" }) {
  if (id === "card") return <span className="payment-card-pair" aria-hidden="true"><BrandMark brand="visa" /><BrandMark brand="mastercard" /></span>;
  if (id === "more") return <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={2} />;
  if (id === "google_pay") { const m = BRAND_MARKS.googlepay; return <svg viewBox="0 0 24 24" role="img" aria-label={m.title} className="h-[22px] w-[22px]"><path d={m.path} fill="currentColor" /></svg>; }
  return <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]"><circle cx="12" cy="12" r="12" className="payment-red" /><path className="payment-white" d="M12.6 5.2c2.3-.6 4.4.2 5 .6-1.8.1-3.5 1.4-3.5 3.6 2 .5 3.4 2 3.4 4.2 0 2.7-2.3 4.9-5.2 4.9-3.3 0-5.7-2.7-5.7-6 0-3.6 2.5-6.5 6-7.3z" /></svg>;
}
