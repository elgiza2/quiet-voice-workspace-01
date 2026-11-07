/** Adapted from elgiza2/nova-quest-rewards-hub PaymentGatewaySheet.
 * Presentation only: the caller keeps all pricing and settlement logic. */
import { ChevronRight, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const VISA_PATH = "M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z";

export function PaymentMethodMark({ method }: { method: "card" | "wallet" }) {
  return method === "wallet" ? (
    <span className="ck-brand ck-brand-wallet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0A12 12 0 0 0 0 12A12 12 0 0 0 12 24A12 12 0 0 0 24 12A12 12 0 0 0 12 0M16.25 1.12C16.57 1.12 16.9 1.15 17.11 1.22C14.94 1.67 13.21 3.69 13.22 6C13.22 6.05 13.22 6.11 13.23 6.17C16.87 7.06 18.5 9.25 18.5 12.28C18.54 15.31 16.14 18.64 12.09 18.65C8.82 18.66 5.41 15.86 5.39 11.37C5.38 8.4 7 5.54 9.04 3.85C11.04 2.19 13.77 1.13 16.25 1.12Z" /></svg></span>
  ) : (
    <span className="ck-brand ck-brand-card"><svg viewBox="0 7 24 10" className="ck-visa" aria-hidden="true"><path d={VISA_PATH}/></svg><svg viewBox="0 0 32 20" className="ck-master" aria-hidden="true"><circle cx="12" cy="10" r="8" className="ck-master-red"/><circle cx="20" cy="10" r="8" className="ck-master-gold"/><path d="M16 3.07A8 8 0 0 1 16 16.93A8 8 0 0 1 16 3.07Z" className="ck-master-overlap"/></svg></span>
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