/**
 * Central registry of routes → chunk loaders. Imported once at app startup.
 * Powers hover/focus/touch prefetch via `<PrefetchLink>` and `<NavLink>`.
 *
 * Rules:
 *   - Patterns are matched against `location.pathname` (no query/hash).
 *   - Use RegExp with `^...$` anchors for exact routes, or partial for prefixes.
 *   - The loader MUST be the same `() => import("...")` used by React.lazy in
 *     App.tsx so the browser dedupes on the module cache key.
 *   - Registering a route that isn't in the router is harmless — it just
 *     never matches — but stale entries pointing at deleted files WILL break
 *     the build. Keep this list in sync when adding/removing routes.
 */
import { registerRoute } from "@/lib/routePrefetch";

// -- Top-level app routes --------------------------------------------------
registerRoute(/^\/auth(\/|$)/, () => import("@/pages/auth/AuthPage"));
registerRoute(/^\/chat(\/|$)/, () => import("@/pages/agent/AgentHubPage"));
registerRoute(/^\/(index)?$/, () => import("@/pages/agent/AgentHubPage"));
registerRoute(/^\/wallet(\/|$)/, () => import("@/pages/wallet/WalletPage"));

// -- Settings --------------------------------------------------------------
registerRoute(/^\/settings(\/|$)/, () => import("@/pages/ceyo/CeyoSettings"));
registerRoute(/^\/settings\/customization$/, () => import("@/pages/ceyo/CeyoSettings"));
registerRoute(/^\/settings\/security$/, () => import("@/pages/ceyo/CeyoSettings"));
registerRoute(/^\/settings\/profile\/edit$/, () => import("@/pages/ceyo/CeyoSettings"));

// -- Billing / referrals ---------------------------------------------------
registerRoute(/^\/usage(\/|$)/, () => import("@/pages/ceyo/CeyoSettings"));
registerRoute(/^\/billing\/success$/, () => import("@/pages/ceyo/CeyoSettings"));
registerRoute(/^\/referrals(\/|$)/, () => import("@/pages/ceyo/CeyoSettings"));
registerRoute(/^\/referrals\/resources$/, () => import("@/pages/ceyo/CeyoSettings"));

// -- Marketing / SEO -------------------------------------------------------
registerRoute(/^\/pricing$/, () => import("@/pages/ceyo/CeyoSettings"));

// -- Integrations ----------------------------------------------------------

// -- Landings / promos -----------------------------------------------------

// -- Idle warm-up: download the main screens once the first one is shown, so
//    moving between Home, Settings and Wallet never waits for the network.
if (typeof window !== "undefined") {
  const warm = () => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    void import("@/pages/agent/AgentHubPage");
    void import("@/pages/ceyo/CeyoSettings");
    void import("@/pages/wallet/WalletPage");
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  const schedule = () => (idle ? idle(warm, { timeout: 4000 }) : setTimeout(warm, 2500));
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

export {};
