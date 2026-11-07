/** Adapted from elgiza2/nova-quest-rewards-hub PaymentGatewaySheet.
 * Presentation only: the caller keeps all pricing and settlement logic. */
import { ChevronRight, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PaymentMethodMark({ method }: { method: "card" | "wallet" }) {
  return method === "wallet" ? (
    <span className="ck-brand ck-brand-wallet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0A12 12 0 0 0 0 12A12 12 0 0 0 12 24A12 12 0 0 0 24 12A12 12 0 0 0 12 0M16.25 1.12C16.57 1.12 16.9 1.15 17.11 1.22C14.94 1.67 13.21 3.69 13.22 6C13.22 6.05 13.22 6.11 13.23 6.17C16.87 7.06 18.5 9.25 18.5 12.28C18.54 15.31 16.14 18.64 12.09 18.65C8.82 18.66 5.41 15.86 5.39 11.37C5.38 8.4 7 5.54 9.04 3.85C11.04 2.19 13.77 1.13 16.25 1.12Z" /></svg></span>
  ) : (
    <span className="ck-brand ck-brand-card"><svg viewBox="0 0 60 24" aria-hidden="true"><text x="2" y="16" className="ck-visa">VISA</text><circle cx="41" cy="12" r="8" className="ck-master-red"/><circle cx="49" cy="12" r="8" className="ck-master-gold"/><path d="M45 5.07a8 8 0 0 1 0 13.86a8 8 0 0 1 0-13.86Z" className="ck-master-overlap"/></svg></span>
  );
}

export function PaymentGatewaySheet({ provider, methods, loading, onSelect, onCancel, ar }: {
  provider?: "kashier" | "dodo"; methods: string[]; loading: boolean; ar: boolean;
  onSelect: (method: "card" | "wallet") => void; onCancel: () => void;
}) {
  return <>
    <div className="ck-gateway-list">
      {loading ? <div className="ck-quote-loading" role="status"><Loader2 className="animate-spin" />{ar ? "تحميل طرق الدفع…" : "Loading payment methods…"}</div> : provider === "kashier" ? (
        (["card", "wallet"] as const).map(method => <Button data-no-neo variant="ghost" className="ck-gateway-row" key={method} onClick={() => onSelect(method)}>
          <PaymentMethodMark method={method}/><span><strong>{method === "card" ? ar ? "فيزا أو ماستركارد" : "Visa or Mastercard" : ar ? "محفظة موبايل" : "Mobile wallet"}</strong><small>{method === "card" ? ar ? "بطاقة بنك محلي" : "Local bank card" : ar ? "فودافون كاش" : "Vodafone Cash"}</small></span><ChevronRight/>
        </Button>)
      ) : provider === "dodo" ? <Button data-no-neo variant="ghost" className="ck-gateway-row" onClick={() => onSelect("card")}><span className="ck-brand"><CreditCard/></span><span><strong>{ar ? "كارت أو طريقة دفع محلية" : "Card or local payment"}</strong><small>{methods.join(" · ")}</small></span><ChevronRight/></Button> : null}
    </div>
    <Button data-no-neo variant="ghost" className="ck-cancel" onClick={onCancel}>{ar ? "إلغاء" : "Cancel"}</Button>
  </>;
}