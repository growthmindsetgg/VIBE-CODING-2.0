# VibeFunds — SOP, test plan, and product reality check

Operational and QA material for maintainers. Pair with `WHITEPAPER-SOURCE-FOR-JENNI.md` for external messaging.

---

## A. Standard operating procedures (SOP)

### A.1 Environment setup (local / Vercel)

1. Copy `.env.example` → `.env.local` (Next.js).
2. Set **`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`** (WalletConnect Cloud) if you need mobile wallets.
3. Set **`NEXT_PUBLIC_USDC_ADDRESS`** to the **verified** Arc testnet USDC contract (Circle/Arc docs).
4. Optional: **`NEXT_PUBLIC_ARC_RPC_URL`** override; default RPC is `https://rpc.testnet.arc.network`.
5. Optional: **`NEXT_PUBLIC_PROTOCOL_TREASURY`** for micro-payment recipient; if unset, UI sends to the **connected wallet** (testnet demo behavior).
6. Optional Supabase: **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`** (server-only, never expose to client).

### A.2 Contract compile & deploy (Arc testnet)

1. Configure Hardhat env: **`ARC_RPC_URL`**, **`DEPLOYER_PRIVATE_KEY`**.
2. Set **`USDC_ADDRESS`** for deploy when you want FundManager + wiring in the deploy script.
3. Run `npm run compile`.
4. Run `npm run deploy:arc`.
5. Record **share token**, **NFT**, **FundManager** addresses from script output.
6. In the app: create or open fund → **Link deployed contracts** (creator wallet) → save.

### A.3 Post-deploy wiring check

1. Confirm FundManager **`shareTokenConfigured`** reads `true` on Arc (explorer or wagmi read).
2. If `false` or subscribe reverts: ensure deploy script ran **`setShareToken`** and **transferred share token ownership** to FundManager as designed.
3. User flow: connect wallet on Arc → approve USDC → **Subscribe** with small amount → verify share balance and vault USDC on explorer.

### A.4 Web release (GitHub → Vercel)

1. Merge to **`main`**.
2. Confirm Vercel project is connected to the repo; wait for deployment or **Redeploy**.
3. After changing env vars in Vercel, **Redeploy** so the build picks them up.

### A.5 Incident triage (quick)

| Symptom | Likely cause |
|---------|----------------|
| Wallet won’t connect on mobile | Missing `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. |
| Subscribe disabled / “not ready” | `shareTokenConfigured` false, wrong FundManager address, or RPC read failure. |
| USDC tx fails / wrong token | Wrong `NEXT_PUBLIC_USDC_ADDRESS`. |
| Funds missing on new device | Supabase not configured; data was `localStorage`-only. |
| Build fails on Vercel | Env missing for required API routes; check logs. |

---

## B. Test plan — checklist

Use ✓ per release. **Environment:** note Arc testnet + browser (Chrome/Brave recommended).

### B.1 Marketing & static

| ID | Case | Steps | Expected |
|----|------|--------|----------|
| T1 | Landing loads | Open `/` | Header, hero, how-it-works, ticker; no console errors. |
| T2 | Nav links | Click How it works, Litepaper, GitHub | Anchor / `/litepaper` / GitHub opens. |
| T3 | Launch app | Click Launch app | `/marketplace` loads inside app shell. |
| T4 | Litepaper | Open `/litepaper` | Content renders; back link works. |

### B.2 App shell & wallet

| ID | Case | Steps | Expected |
| T5 | Shell layout | Visit `/marketplace` | Sidebar + top bar; Arc testnet badge. |
| T6 | Connect | Connect wallet, switch to Arc 5042002 | Address shown; no stuck loading. |
| T7 | Disconnect | Disconnect | UI returns to disconnected state. |
| T8 | Marketing link | Footer/sidebar “Marketing site” | `/` loads. |

### B.3 Fund lifecycle (off-chain data)

| ID | Case | Steps | Expected |
| T9 | Create fund | `/create-fund`, fill form, submit | Redirects to `/fund/[id]`; fund appears in My funds / Marketplace. |
| T10 | Marketplace cards | Open `/marketplace` | Each fund shows sim NAV bps; link to fund works. |
| T11 | My funds filter | `/my-funds` with same wallet | Only creator’s funds; empty state if none. |
| T12 | Wrong wallet | Connect wallet B | My funds empty for funds created by A (expected). |

### B.4 Contract linking

| ID | Case | Steps | Expected |
| T13 | Link addresses | As creator, paste valid `0x` addresses, save | Persisted (reload page). |
| T14 | Invalid address | Paste invalid hex | Validation error, no silent fail. |
| T15 | Non-creator | Open fund as non-creator | Link form hidden (ContractLinker absent). |

### B.5 On-chain (needs deployed contracts + USDC env)

| ID | Case | Steps | Expected |
| T16 | Subscribe | Approve + Subscribe small USDC | Tx succeeds; share balance increases; message shows hash snippet. |
| T17 | Subscribe gated | Before `setShareToken` / wrong manager | UI explains or tx reverts with clear copy. |
| T18 | Deposit only | Deposit USDC | Vault USDC up; shares unchanged. |
| T19 | Transfer shares | Transfer to second wallet | Recipient receives ERC-20 wei (verify on explorer). |
| T20 | Micro-payments | Send micro USDC | Tx succeeds when token + recipient resolved. |

### B.6 Train agent (local only)

| ID | Case | Steps | Expected |
| T21 | Play round | Pick long/short | Result text, XP changes. |
| T22 | Leaderboard | Connect, play | Entry appears (browser-local). |
| T23 | Next round | Advance | New round id, state resets appropriately. |

### B.7 API / Supabase (if enabled)

| ID | Case | Steps | Expected |
| T24 | POST fund | Create fund with API active | Row in Supabase `vibefunds` (verify dashboard). |
| T25 | GET merge | Reload app | Remote + local merge behaves per implementation (no crash). |

### B.8 Regression / build

| ID | Case | Steps | Expected |
| T26 | Production build | `npm run build` | Success. |
| T27 | Lint | `npm run lint` | No errors. |

---

## C. Reality check — product utility

Use this table when pitching, fundraising, or writing a whitepaper so claims stay accurate.

| Claim | Reality today | Notes |
|-------|----------------|-------|
| “Mutual fund on-chain” | **Partial** | There is a USDC vault + mint/burn-style share flow **per deployed instance**; no regulated fund, no prospectus. |
| “AI agent manages money” | **No (MVP)** | Personalities + copy + **local** mini-game only; **no** autonomous on-chain portfolio manager. |
| “NAV / performance” | **Simulated UX only** | Bps numbers are **deterministic fake** for demos, not oracle or historical performance. |
| “ERC-404” | **Inspired hybrid** | Custom paired ERC-20 + ERC-721; not a formal standards audit; NFT transfer caveat applies. |
| “Cross-device funds” | **Only with Supabase** | Otherwise `localStorage` is device-bound. |
| “Production mainnet ready” | **No** | Testnet prototype; audits and hardening not claimed in repo. |
| **Genuine utility (honest)** | **Yes, as a sandbox** | Good for: learning Arc + USDC + wallet flows; demoing vault/subscribe patterns; iterating on fund UX; hackathon narrative **if** disclosures are clear. |

### Elevator pitch (utility-safe)

> “VibeFunds is a **testnet MVP** that packages vault + hybrid share **concepts** into a usable app: create funds, optionally wire real contracts, and run **subscribe / deposit** flows on Arc — with **clear separation** between what’s on-chain and what’s **simulated or local**.”

---

## D. Suggested next hardening (optional backlog)

- [ ] Formal audit before any mainnet talk.
- [ ] E2E tests (Playwright) for T1–T15.
- [ ] NFT transfer safety or documented restriction in UI.
- [ ] Replace or label sim NAV more aggressively (“Demo only”).
- [ ] RLS-backed Supabase if moving beyond internal demos.

---

*Last aligned with repo structure: App Router, `(app)` shell, landing + litepaper routes.*
