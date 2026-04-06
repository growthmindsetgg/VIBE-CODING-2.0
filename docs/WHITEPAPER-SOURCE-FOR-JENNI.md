# VibeFunds — source material for whitepaper generation (Jenni AI)

**How to use this file:** Feed this entire document (or section-by-section) into Jenni AI with a prompt such as:

> “Using only the facts below, write a professional crypto/Web3 whitepaper. Use neutral, precise language. Clearly separate **implemented MVP** from **future vision**. Include a prominent **risks & disclaimers** section. Do not promise investment returns or claim the NAV simulation is real performance.”

Tone target: institutional-clean, technical accuracy over hype.

---

## 1. Project identity

| Field | Value |
|--------|--------|
| **Name** | VibeFunds |
| **One-line pitch** | A gamified mutual-fund-style web app for creating “agent-themed” fund cards, browsing a marketplace, and (when contracts are deployed and linked) subscribing with USDC on **Arc testnet** for hybrid fungible + NFT-mirrored share units. |
| **Repository** | `https://github.com/growthmindsetgg/vibefund` |
| **Primary chain (today)** | Arc Testnet, chain ID **5042002** |
| **Stack** | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, RainbowKit + wagmi + viem, Hardhat 3, Solidity 0.8.28, OpenZeppelin contracts |
| **License posture** | MIT on contracts (verify `SPDX` in repo); treat as prototype unless stated otherwise |

---

## 2. Problem framing (narrative, factual)

- On-chain fund primitives (vaults, share tokens, access control) are powerful but often **opaque** to end users.
- Hackathon and MVP builders need a **product-shaped layer**: named funds, clear flows, and a path from “idea” to **testnet** execution without hiding what is simulated vs real.
- **USDC-denominated gas** on Arc testnet aligns with stable, predictable experimentation for payments and vault accounting in test environments.

---

## 3. What the product does today (MVP — must be stated honestly)

### 3.1 Web application

- **Marketing site** (`/`): positioning, “how it works,” links to litepaper and GitHub, CTA to launch the app.
- **Litepaper** (`/litepaper`): short product/protocol outline (non-binding).
- **App shell** (dashboard): sidebar navigation + wallet connection (RainbowKit) targeting Arc testnet.
- **Marketplace** (`/marketplace`): lists **all fund records** the client knows about; shows a **deterministic simulated NAV delta in basis points** per fund (see §6 — not real performance).
- **Create fund** (`/create-fund`): user names a fund, selects an **agent personality** (cautious, balanced, aggressive, degen), sets a **human-readable initial USDC target**, and may paste optional deployed contract addresses.
- **My funds** (`/my-funds`): lists funds where `creator` matches the connected wallet address.
- **Fund detail** (`/fund/[id]`): fund cockpit — link/patch contract addresses (creator-only form), mock “holding” adjustments stored locally, **on-chain** subscribe/deposit/transfer when addresses and env are configured, optional micro-USDC actions.
- **Train agent** (`/train-agent`): a **browser-local** prediction mini-game; XP, level, streak, and leaderboard are **not on-chain** and are **not** a live trading agent.

### 3.2 Data persistence

- **Default:** fund metadata and linked addresses persist in **`localStorage`** in the browser.
- **Optional:** if `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set server-side, `GET`/`POST /api/funds` can sync fund rows to Supabase (service role; document security model for any production use).

---

## 4. Smart contracts (technical specification)

### 4.1 `VibeFundERC404.sol` (conceptual ERC-404-style hybrid)

- **VibeFundShareToken (ERC-20)** paired with **VibeFundShareNFT (ERC-721 enumerable)**.
- **Convention:** `1e18` ERC-20 wei corresponds to **one whole** NFT unit; the NFT contract `sync`s on ERC-20 balance changes driven from the token’s `_update` hook.
- **Known MVP caveat (must appear in whitepaper risks):** transferring NFTs directly can **desync** balances vs the intended invariant; the README and product guidance prefer **ERC-20 transfers** for the MVP.

### 4.2 `FundManager.sol`

- Holds **USDC** (immutable `IERC20 usdc` in constructor).
- **Owner-only** `setShareToken(address)` — **one-time**; sets mint interface to share token; `shareTokenConfigured` flag.
- **`subscribe(uint256 usdcAmount)`:** pulls USDC from `msg.sender`, mints share tokens at **1 USDC (6 decimals) → `usdcAmount * 1e12` wei**, i.e. **1e18 share wei per 1 USDC** (document the decimal math explicitly).
- **`deposit(uint256 amount)`:** pulls USDC into vault **without** minting shares.
- **Owner:** `withdraw`, `microPay` (with memo event), `rebalance` (event-only hook in MVP bytecode).

### 4.3 Deployment script behavior (high level)

- With `USDC_ADDRESS` configured for Hardhat deploy, the flow is intended to deploy FundManager and wire **share token ownership** to the manager so `subscribe` can mint.

---

## 5. “Agent” and personalities — accuracy boundary

- **Personalities** affect **local simulation only** (e.g. NAV delta multipliers and XP gains in the training game).
- There is **no** trustless on-chain AI agent executing trades inside the audited core loop described above; any future “agent” should be described as **roadmap** unless separately shipped and specified.

---

## 6. NAV simulation (explicitly not performance)

- Marketplace and fund views can show **“NAV Δ (sim)”** in **basis points**.
- Implementation is **deterministic from** `fund.id`, `createdAt`, wall-clock time, and personality — a **sine/drift/hash** blend for UX, **not** oracle-fed or back-tested returns.
- Whitepaper must **not** present this as track record, APY, or investment performance.

---

## 7. Security and maturity statements (required)

- **Testnet / prototype:** contracts and UI are for **experimentation**; not audited for mainnet production unless a future version says so.
- **Keys:** never expose `DEPLOYER_PRIVATE_KEY` or Supabase **service role** to the client.
- **WalletConnect:** mobile wallet flows typically need `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
- **USDC address:** must be the **official** Arc testnet USDC from Circle/Arc documentation — wrong address = wrong asset.

---

## 8. Vision language (optional section — label as roadmap)

Examples of **future** directions (only if framed as hypotheses): on-chain strategy hooks fed by verified agent outputs, richer risk dashboards, mainnet deployment with audits, formal ERC-404 alignment, NFT transfer safety, multi-vault strategies, governance.

---

## 9. Glossary (for Jenni to normalize terms)

| Term | Definition |
|------|------------|
| **Arc testnet** | Circle’s Arc network test environment (chain ID 5042002 in this project). |
| **Subscribe** | User-approved USDC pull + share mint via `FundManager.subscribe`. |
| **Deposit (vault only)** | USDC to vault without share mint. |
| **Share wei** | ERC-20 smallest units; `1e18` wei = 1 whole NFT unit in the pairing design. |
| **Personality** | UI/simulation parameter set; not an on-chain agent. |

---

## 10. References (link in appendix)

- Arc docs: `https://docs.arc.network`
- Arc testnet RPC (as used in app): `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Circle testnet USDC documentation (network list / faucets): `https://developers.circle.com/stablecoins/usdc-on-test-networks`
- OpenZeppelin Contracts (dependency)

---

## 11. Disclaimer block (Jenni should include verbatim or equivalent)

> VibeFunds is experimental software deployed for **testing and education** on **testnets**. Nothing in this document is investment, legal, or tax advice. **Simulated NAV and gameplay metrics are not performance data.** Smart contracts may contain bugs; users may lose test tokens. Use at your own risk.

---

*End of source material. After Jenni generates your PDF/DOCX/Markdown whitepaper, add it to the repo (e.g. `docs/whitepaper.pdf`) and ask your developer to commit and push.*
