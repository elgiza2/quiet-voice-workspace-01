# Ceyo — project structure (read first)

Handoff for the next AI agent. Keep this file current when structure changes.

## Product split (target)
| Surface | Domain | Status | Payments |
|---|---|---|---|
| Landing | `ceyo.si` | Not designed yet — will be designed section by section later. Do not build it unasked. | none |
| Web app | `web.ceyo.si` | This codebase (current app) | Kashier — reuse the checkout popup from `github.com/elgiza2/nova-quest-rewards-hub` |
| Android app | `app.ceyo.si` | Same codebase wrapped as Android shell (see `docs/android-bridge.md`) | Google Play Billing only (store policy) |

Platform detection should pick the payment path: Android shell → Google Play; browser → Kashier. Never show Kashier inside the Android app.

## Stack
- TanStack Start v1 + React 19 + Vite 7, Tailwind v4 (`src/styles.css`), deployed to edge workers.
- Backend: user-managed Supabase (auth = email OTP, RLS on every table). Server logic in `createServerFn` and `src/routes/api/*`; public webhooks under `src/routes/api/public/*` verify the caller themselves.
- Legacy Supabase Edge Functions remain in `supabase/functions` (Kashier checkout/webhook/renewals, media). New server code goes in TanStack server routes, not Edge Functions.

## Code map
- `src/routes/` — file routes; `src/routes-app/AppRoutes.tsx` — signed-in app shell + onboarding gate.
- `src/pages/agent/` — home (bots, groups, chats). `hub/HubChat.tsx` chat, `hub/HubPanels.tsx` bot/group forms, `hub/people/` people + mixed groups.
- `src/pages/ceyo/CeyoSettings.tsx` — all settings pages incl. Phone. Styles: `src/styles/settings-polish.css` (loaded last).
- `src/pages/wallet/` — self-custodial wallet; market data only via `marketData.ts`.
- `src/lib/ceyo/` agent loop + tools; `src/lib/phone/` Telnyx; `src/lib/calls/` voice/video; `src/lib/wallet/` signing; `src/lib/keys/` provider key pool.
- Each folder's `AGENTS.md` holds its rules — read it before editing that folder.

## Payments
- Prices live in `src/lib/payments/plans.ts` (USD; server prices every order from it).
- `/api/billing` (signed-in) starts Kashier hosted checkout or verifies a Google Play token; `/api/public/kashier-webhook` verifies the HMAC signature and calls `settle_payment_order` (one-time, atomic).
- Tables: `payment_orders`, `subscriptions` (owner read-only; server writes). Popup: `src/components/billing/CheckoutSheet.tsx`.
- Kashier keys: provider keys `kashier_merchant_id`, `kashier_api_key` (env fallback); `KASHIER_MODE=test`, `KASHIER_CURRENCY` optional.
- Domains: `src/config/domains.ts` decides the surface by host.

## Groups
One "New Group" flow (`NewPeopleChat` mode `group`): add any mix of people and bots. There is no separate "people group" entry.

## Speed and security conventions (big-company practice)
- Route-level code splitting (lazy routes), prefetch on link hover/intent (`defaultPreload: "intent"`), TanStack Query cache with `staleTime` so moving between pages renders instantly from cache.
- No waterfalls: route loaders `ensureQueryData` in parallel; heavy libs (calls, charts, OpenUI) dynamic-imported.
- Static assets immutable-cached; API responses short-cached only when public.
- Security: RLS everywhere, secrets server-only, signed webhooks, no service-role key in browser, CSP-safe sandboxed iframes for model HTML.

## Handoff files
`roadmap.md` = active task list; `README.md` = current work + verification; `AGENTS.md` (root + per folder) = rules.

- Web payments: Egypt uses Kashier Direct API (card from browser to Kashier, Vodafone Cash R2P, EGP from live FX); other countries use Dodo checkout confirmed by server lookup; product ids in src/lib/payments/regions.ts.
