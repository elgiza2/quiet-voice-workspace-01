/** White bottom payment box (summary → payment methods), matching the user's checkout screenshots. */
import { useState } from "react";
import { ArrowLeft, Check, ChevronRight, CreditCard, Loader2 } from "lucide-react";
import { BRAND_MARKS } from "@/lib/payments/brandMarks";

export type BoxMethod = "card" | "wallet" | "google_pay";

const Mark = ({ k }: { k: "visa" | "mastercard" | "googlepay" | "vodafone" }) => {
  if (k === "vodafone") return <svg viewBox="0 0 24 24" className="cbox-mark-svg"><circle cx="12" cy="12" r="11" fill="#E60000" /><path fill="#fff" d="M12.6 5.2c2.3-.6 4.4.2 5 .6-1.8.1-3.5 1.4-3.5 3.6 2 .5 3.4 2 3.4 4.2 0 2.7-2.3 4.9-5.2 4.9-3.3 0-5.7-2.7-5.7-6 0-3.6 2.5-6.5 6-7.3z" /></svg>;
  if (k === "mastercard") return <svg viewBox="0 0 32 20" className="cbox-mark-svg cbox-mark-wide"><circle cx="11" cy="10" r="8" fill="#EB001B" /><circle cx="21" cy="10" r="8" fill="#F79E1B" fillOpacity=".95" /></svg>;
  const m = BRAND_MARKS[k];
  return <svg viewBox="0 0 24 24" className="cbox-mark-svg cbox-mark-wide" role="img" aria-label={m.title}><path d={m.path} fill={`#${m.hex}`} /></svg>;
};
const Tile = ({ k }: { k: Parameters<typeof Mark>[0]["k"] }) => <span className="cbox-tile"><Mark k={k} /></span>;

export function CheckoutBox({ name, subtitle, total, kashier, busy, error, onPay }: {
  name: string; subtitle: string; total: string; kashier: boolean | null; busy: boolean; error: string;
  onPay: (m: BoxMethod) => void;
}) {
  const [view, setView] = useState<"summary" | "methods">("summary");
  const [method, setMethod] = useState<BoxMethod | null>(null);
  const label = method === "wallet" ? "Vodafone Cash" : method === "google_pay" ? "Google Pay" : method === "card" ? "Card" : "Add card";
  const pick = (m: BoxMethod) => { setMethod(m); setView("summary"); };

  if (view === "methods") return (
    <div className="cbox" role="group" aria-label="Payment methods">
      <div className="cbox-head"><button type="button" className="cbox-back" aria-label="Back" onClick={() => setView("summary")}><ArrowLeft /></button><h2>Payment methods</h2></div>
      {kashier ? (
        <button type="button" className="cbox-option" onClick={() => pick("wallet")}><Tile k="vodafone" /><span><b>Vodafone Cash</b><small>Approve the payment on your phone</small></span>{method === "wallet" && <Check className="cbox-check" />}</button>
      ) : (
        <button type="button" className="cbox-option" onClick={() => pick("google_pay")}><Tile k="googlepay" /><span><b>Google Pay</b><small>Pay with your Google account</small></span>{method === "google_pay" && <Check className="cbox-check" />}</button>
      )}
      <hr className="cbox-rule" />
      <p className="cbox-section">Add a payment method to your account</p>
      <button type="button" className="cbox-addcard" onClick={() => pick("card")}><CreditCard /><span>Add card</span><span className="cbox-marks"><Tile k="mastercard" /><Tile k="visa" /></span></button>
    </div>
  );

  return (
    <div className="cbox" role="group" aria-label="Checkout">
      <div className="cbox-summary">
        <img src="/app-icon-192.png" alt="" className="cbox-logo" />
        <div className="cbox-plan"><b>{name}</b><small>{subtitle}</small></div>
        <strong className="cbox-price">{total}</strong>
      </div>
      <button type="button" className="cbox-pay-row" onClick={() => setView("methods")} disabled={kashier === null || busy}>
        <span className="cbox-row-icon">{method && method !== "card" ? <Mark k={method === "wallet" ? "vodafone" : "googlepay"} /> : <CreditCard />}</span>
        <span><b>{label}</b><small>{method ? "Tap to change" : "Tap to choose how to pay"}</small></span>
        <span className="cbox-chev"><ChevronRight /></span>
      </button>
      {error && <p role="alert" className="cbox-error">{error}</p>}
      <p className="cbox-note">Tap "Subscribe" to complete your purchase.</p>
      <button type="button" className="cbox-cta" disabled={busy || kashier === null} onClick={() => method ? onPay(method) : setView("methods")}>
        {busy ? <Loader2 className="cbox-spin" /> : "Subscribe"}
      </button>
      <div className="cbox-brands"><Tile k="visa" /><Tile k="mastercard" />{kashier ? <Tile k="vodafone" /> : <Tile k="googlepay" />}</div>
    </div>
  );
}
