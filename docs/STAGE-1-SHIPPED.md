# Stage 1 — Quick Wins (shipped 2026-05-24)

**Branch:** `stage-1-quickwins`
**Commit:** `252352b` — `feat(stage-1): error toasts, chain logos, coming soon, base-app redirect, about link, tagline`
**Base:** `main` @ `41e9a85` (feat(mobile): drawer nav + mobile top bar)
**Net diff vs main:** +420 / −119 across 21 files (15 modified + 6 new).
**Build:** clean (`npm run build` exit 0, 21/21 routes prerendered, `/` route remains `○ Static` at 4.3 kB).

## One-line summary
Replaced verbose on-chain errors with toasts, added official chain logos, marked four routes as "Coming Soon" without breaking them, redirected first-entry Base App users to /swap, added an About link, and slotted in the new tagline — all on a single feature branch, no agent/contract logic touched.

---

## Files changed by task

### Task 2 — Error toast utility (Sonner)
| File | ± | Notes |
|---|---|---|
| `lib/errors.ts` | **new** | `toastError(err)` — walks viem/wagmi error chain, maps to 8 short messages, always `console.error("[VibeFunds error]", err)` for DevTools |
| `app/(app)/swap/page.tsx` | +3/−2 | onApprove + onSwap catches → `toastError` (kept inline aggregator price-quote error at L219 — see Skips) |
| `app/(app)/liquidity/page.tsx` | +6/−16 | 5 catches → `toastError`; preserved re-throw in `approveToken`; left inner sim catch + empty catches that re-throw upward |
| `app/(app)/admin/agent/page.tsx` | +5/−7 | 3 catches → `toastError`; removed `formatOnchainError` import |
| `app/(app)/admin/forex/page.tsx` | +3/−5 | 3 catches; removed import |
| `app/(app)/admin/vault/page.tsx` | +3/−2 | 2 catches |
| `components/forex/liquidity-panel.tsx` | +3/−11 | 3 catches; removed import |
| `components/stable-vault/forex-vault-card.tsx` | +3/−13 | 3 catches; removed import |
| `components/stable-vault/forex-agent-card.tsx` | +3/−13 | 3 catches; removed import |
| `components/stable-vault/stake-pool-card.tsx` | +3/−11 | 3 catches; removed import |
| `components/vibefunds/onchain-fund-panel.tsx` | +2/−1 | 1 catch |
| `components/vibefunds/micro-actions.tsx` | +2/−1 | 1 catch |

**Total:** 24 catch blocks replaced across 11 files. `<Toaster />` was already mounted at `components/layout/app-shell.tsx:82` — no provider changes needed. `formatOnchainError` retained where still used (swap page inline aggregator quote, liquidity page inner sim re-throw).

### Task 3 — Chain logos
| File | ± | Notes |
|---|---|---|
| `public/logos/base.svg` | **new (672 B)** | Source: `raw.githubusercontent.com/base/brand-kit/main/logo/TheSquare/Digital/Base_square_blue.svg` |
| `public/logos/monad.svg` | **new (548 B)** | Source: inline SVG from `monad.xyz` homepage `aria-label="Monad Logomark"` (viewBox preserved; brand purple `#836EF9`) |
| `public/logos/arc.svg` | **new (970 B)** | Source: `cdn.prod.website-files.com/.../arc-icon.svg` on `arc.io` (Circle's Arc; `docs.arc.network` 301s to `docs.arc.io` — same property) |
| `components/ui/chain-logo.tsx` | **new (72)** | Inline-SVG component, `currentColor` fill for Arc, hardcoded brand fills for Base + Monad, handles `chainId: number \| undefined → null`, includes the duplication-rationale comment block |
| `components/stable-vault/wrong-network-banner.tsx` | +2/−2 | `<ChainLogo>` in each switch button, surrounding `text-amber-100` colors Arc |
| `components/layout/app-shell.tsx` | +3/−1 (logo wiring only) | Desktop chain badge prefixed with `<ChainLogo chainId={chainId} className="size-3.5" />` inside the flex span |

**Path-data duplication note:** Arc/Base/Monad path strings live in BOTH `/public/logos/*.svg` (canonical files; useful for OG embeds, social previews, non-React consumers) AND inline in `chain-logo.tsx` (runtime render with `currentColor` for Arc). Future cleanup: switch to SVGR (`@svgr/webpack`) to import SVGs directly as components and eliminate duplication. Documented at the top of `chain-logo.tsx`.

**Surfaces verified via grep:** `wrong-network-banner.tsx` (switch buttons) + `app-shell.tsx:230-239` (desktop "Base · 8453" badge). RainbowKit's `<ConnectButton chainStatus="icon|full">` at `app-shell.tsx:218, 238` renders its own bundled chain icons — left alone per spec.

### Task 4 — Approve button color matches Swap
| File | ± | Notes |
|---|---|---|
| `app/(app)/swap/page.tsx` | +1/−1 | Approve button `brutalOutline` → `brutalPrimary` (matches Swap variant; size kept at default `h-11` while Swap stays `size="lg" h-12` to preserve action hierarchy) |
| `app/(app)/liquidity/page.tsx` | +2/−2 | Both Approve buttons (USDC/EURC) `outline` → `brutalPrimary` |

**Pre-existing inconsistency incidentally fixed:** the liquidity page Approve buttons were using `variant="outline"` — the dark cyber-cyan theme variant — on a light brutalist surface. Theme leak existed before Task 4; the color-match brought them onto the page's theme as a side effect.

7 other Approve buttons across `stake-pool-card.tsx`, `forex-vault-card.tsx`, `forex-agent-card.tsx`, `forex/liquidity-panel.tsx` already rendered as `brutalPrimary` via the Button component's `defaultVariants.variant`. Not touched.

### Task 5 — "Coming Soon" disabled drawer items
| File | ± | Notes |
|---|---|---|
| `components/layout/app-shell.tsx` | (part of net +73) | Added `NavItem` type with optional `comingSoon: true`; Coming Soon items render `<div aria-disabled tabIndex={-1} aria-label="<Label>, coming soon">` instead of `<Link>`; label wrapped in `<span class="opacity-50">` so SOON pill stays bright (CSS opacity is multiplicative — child can't override parent); active highlight still applied when current route IS a Coming Soon route; brand link `/marketplace` → `/swap` in both drawer header and mobile top bar |
| `components/layout/app-top-nav.tsx` | +25/−10 | Same pattern with smaller `text-[9px]` pill for the denser top-nav rows |

**Coming Soon items:** Marketplace, My funds, Create fund, Train agent (all 4 covered on both drawer + top nav surfaces).
**Live items:** Swap, Pool, Stake, Forex (drawer); Swap, Pool (top nav).
**Routes still load** if typed directly — Coming Soon only removes nav promotion.

### Task 6 — Base App cold-entry redirect to /swap
| File | ± | Notes |
|---|---|---|
| `components/base-app-landing-redirect.tsx` | **new (72)** | Client component with `useEffect` + `useRouter().replace("/swap")`. Includes 30+ lines of design-intent comment covering detection rationale, sessionStorage choice, replace-not-push, separate-component-for-SSR, fail-closed semantics |
| `app/page.tsx` | +2 (T6 only) | Imports + renders `<BaseAppLandingRedirect />` at top of returned JSX; landing page stays `○ Static` |

**Detection:** `window.ethereum?.isCoinbaseWallet === true` **AND** mobile UA (`/Android|iPhone|iPad|iPod|Mobile/i`). Combined to exclude desktop-CB-Wallet-extension false positives.
**Loop prevention:** `sessionStorage.getItem("vf_base_app_redirected")` check before redirect; `router.replace` (not push) so back button doesn't loop.
**Fail-closed:** `router.replace` sits OUTSIDE the try block — if sessionStorage throws (sandboxed iframe, private mode), the early return skips the redirect entirely rather than risking a loop.

### Task 7 — About link in drawer
| File | ± | Notes |
|---|---|---|
| `components/layout/app-shell.tsx` | (part of net +73) | Added `Info` to `lucide-react` import; new `<Link href="/">` in the drawer footer ABOVE the existing `← Marketing site` link, separated by `<div class="my-2 border-t border-black/10" aria-hidden />`. Same nav-item styling primitives as main nav. Active highlight intentionally omitted — `/` renders outside `AppShell` (verified: AppShell mounts only at `app/(app)/layout.tsx:4`), so the drawer never renders on `/`, so active state on About could never fire. |

### Task 8 — Tagline update
| File | ± | Notes |
|---|---|---|
| `app/page.tsx` | +3/−1 (T8 only) | H1 `"Say hello to VibeFunds"` → `"Trade while you sleep.<br />Earn while you live."`. Two-line treatment chosen — at `text-6xl lg:` with `leading-[0.95]`, 46-char single line wraps awkwardly mid-clause; explicit `<br />` makes the sentence parallelism land visually. Existing className unchanged; nothing else in the hero or page was touched. |

---

## Risk callouts

### 1. Base App detection method (no Base docs precedent)
Base's official docs (post-April-2026 spec change) treat the Base App as a "standard web app" and provide no programmatic detection API or user-agent suffix. Verified via:
- `https://docs.base.org/mini-apps/troubleshooting/base-app-compatibility`
- `https://docs.base.org/builderkits/minikit/existing-app-integration`
- [coinbase-wallet-sdk#593](https://github.com/coinbase/coinbase-wallet-sdk/issues/593) (Coinbase maintainers ackowledge the gap)

**Our hybrid approach:** `window.ethereum?.isCoinbaseWallet === true` is the canonical SDK-level flag (confirmed in `node_modules/@coinbase/wallet-sdk/dist/CoinbaseWalletProvider.d.ts:13` — `readonly isCoinbaseWallet = true`). Combined with a mobile UA filter to exclude desktop-extension false positives.

**Failure modes covered:**
- Desktop CB Wallet extension users → mobile UA check fails → no redirect ✓
- Mobile Safari without CB Wallet → `isCoinbaseWallet` undefined → no redirect ✓
- Sandboxed iframe / private-mode sessionStorage throws → fail-closed, no redirect ✓
- Back-button from /swap → `router.replace` swapped `/` out of history → no loop ✓
- User taps About in drawer → flag already set during this session → no redirect ✓

**What to watch:** if Base/Coinbase ships an official Mini App SDK with a `useIsInMiniApp()` hook in a later release, swap our detection for theirs. Until then, the SDK-flag-+-mobile-UA combo is the most reliable signal we have.

### 2. Skipped catch blocks (intentional, documented for Stage 2 review)
Six catch blocks were deliberately left untouched during Task 2:

- **`app/(app)/swap/page.tsx:219`** — inline `setAggError(formatOnchainError(e))` in the aggregator price-quote effect. Renders as small input-area feedback, not a verbose red banner — converting to a toast would spam on every keystroke during typing.
- **`app/(app)/liquidity/page.tsx:328`** — inner simulation catch that re-throws into the outer catch (which now toasts via `toastError`).
- **`app/(app)/liquidity/page.tsx:471`** — empty `catch {}` after `approveMicroPulls()` (inner `approveToken` already toasts and re-throws).
- **`app/(app)/liquidity/page.tsx:612, 621`** — inline `.catch(() => {})` swallows on button click; errors already toasted inside `approveToken`.
- **`components/paper-trade/use-paper-trade-price.ts:46`** — background 20s polling hook; surfaces `error` via hook return state. Converting to a toast would fire repeatedly on network blips.
- **All API routes (`app/api/**`)** — server-side, no toast UI applies.

**Stage 2 follow-up:** consider whether the swap-page aggregator quote error (L219) could use a tighter `formatOnchainError`-replacement that produces a short single-clause message inline. Currently it can still render multi-clause `BaseError` output in the small inline space.

### 3. Fail-closed sessionStorage
The Base-app redirect intentionally fails CLOSED (no redirect) when sessionStorage throws — a degraded landing page is a better state than a potential redirect loop in a sandboxed iframe. See `components/base-app-landing-redirect.tsx` comment block.

---

## Pre-existing issues incidentally surfaced

### AppTopNav inventory gap
`components/layout/app-top-nav.tsx` has 6 entries: Marketplace, Train, My funds, Swap, Pool, Create. The drawer (`navFunds + navAgent` in `app-shell.tsx`) has 8 entries: same 6 plus **Stake** and **Forex**. The top nav is missing those two LIVE features — desktop users hitting the duplicate tab row don't see them.

Not introduced by this stage; not fixed in this stage. Stage 2 candidate: align the two surfaces.

### Liquidity page Approve buttons used dark theme variant
Pre-existing: `variant="outline"` (dark cyber-cyan theme variant from `components/ui/button.tsx:13-14`) on the light brutalist liquidity page. Visual theme leak that existed before Stage 1. **Incidentally fixed in Task 4** when those buttons were color-matched to Swap (`brutalPrimary`).

### Chain UI inconsistency: RainbowKit vs ours
`<ConnectButton>` renders RainbowKit's bundled chain icons (its own asset set). Our `<ChainLogo>` renders the official brand assets we sourced. Visually, the two icon styles don't perfectly match in the desktop header — RainbowKit's icon sits next to the account button, ours sits next to "Base · 8453". Acceptable for Stage 1 since they're spatially separated.

---

## What's NOT done (deferred / out of scope)

- **No dark mode toggle** — Stage 3 candidate. Arc logo currentColor work was prep for this (so when light/dark toggles, Arc adapts).
- **No SVGR build setup** — would eliminate `/public/logos/*.svg` ↔ `chain-logo.tsx` path-data duplication. Deferred until other parts of app need SVG-as-component imports.
- **No app-top-nav inventory alignment** — Stake and Forex missing from desktop duplicate tab row (pre-existing).
- **No agent/contract/web3 logic changes** — hard constraint preserved. `lib/wagmi.ts`, `lib/base/builder-code.ts`, all contract ABIs, all wallet plumbing untouched.
- **No automated tests added** — Stage 1 was pure UI/copy/env-driven behavior; manual iPhone walkthrough planned as the verification path.
- **No telemetry on Base-app redirect** — would help validate detection accuracy in production but adds scope. Could log a one-time `vf_base_redirect_fired` event in Stage 2 if we add analytics.

---

## Known Issues / Stage 2 Backlog

### Desktop layout: large empty gap between sidebar and main content

On `(app)` routes (`/swap`, `/forex`, `/stake`, etc.) at desktop widths (≥md breakpoint), there's a ~40% empty gap between the sidebar and the main content column, with content compressed against the right edge and some cards clipping off-screen.

**Status:** pre-existing, NOT introduced by Stage 1.
**Verified:** same gap present on production (commit `41e9a85`) before Stage 1 was branched.

**Reproduction:** open any `(app)` route on desktop ≥1280px wide. The main content area does not fill the available horizontal space between the sidebar and the right edge.

**Suspected cause:** max-width constraint or missing `flex-1` on the main content wrapper in `components/layout/app-shell.tsx`. Diagnosis not yet performed.

**Fix priority:** Stage 2 (low — affects desktop only, mobile is the primary surface).

---

## Verification checklist for iPhone walkthrough
1. Open Base App → tap a link to vibefunds.app/ → should land on /swap (not /)
2. Inside /swap, tap drawer → tap About → should land on / (no redirect back to /swap, flag prevents loop)
3. Open in regular Safari (not Base app) → vibefunds.app/ should show landing page with new tagline
4. Trigger a wallet rejection in Swap or Stake → should see short "Transaction cancelled" toast, NOT verbose viem error
5. Connect on Base mainnet → desktop should show `[Base square logo] Base · 8453` in header badge
6. Tap a Coming Soon drawer item (Marketplace) → nothing happens, label dimmed, SOON pill bright
7. Drawer footer order: About (with Info icon) → thin divider → ← Marketing site
8. Hero headline should read: "TRADE WHILE YOU SLEEP. / EARN WHILE YOU LIVE." (uppercase, two lines, brutalist display font)

---

## Related references
- Sonner mount: `components/layout/app-shell.tsx:82`
- Button variants: `components/ui/button.tsx:6-37` (cva)
- Chain data: `lib/chains/{arc,base,monad}.ts`
- AppShell mount point: `app/(app)/layout.tsx:1,4` (route group `(app)`)
- Root layout (no AppShell): `app/layout.tsx`
