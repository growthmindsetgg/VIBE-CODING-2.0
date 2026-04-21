# Security self-audit — `StableYieldVault`

_Last reviewed: Apr 2026. Contract location: `contracts/StableYieldVault.sol`._

> **Honest disclaimer.** No contract is provably unhackable. This document captures the design
> decisions, threat model, and the **specific** classes of vulnerability that were considered and
> why we believe each is mitigated. A professional third-party audit is still recommended before any
> deployment that holds more than $100k TVL.

---

## 1. Design goals

1. Hold user stablecoins (USDC / EURC / EURW) and return them, plus optional yield.
2. Follow the most widely-audited DeFi pattern available (ERC-4626 vault).
3. Minimise admin power. The owner cannot steal, re-allocate, or even freeze user principal.
4. Be immutable — no upgrade, no proxy, no `delegatecall`, no governance escape hatches.

## 2. Architecture

```
contract StableYieldVault
  is ERC4626            // OpenZeppelin 5.x (audited, inflation-attack mitigated)
  , Ownable2Step        // Two-step ownership transfer — prevents accidental loss
  , Pausable            // Admin can pause deposits, NOT withdrawals
  , ReentrancyGuard     // nonReentrant on every state-mutating external call
```

Inherited behaviour comes from OpenZeppelin v5.6.1 at
`@openzeppelin/contracts` — pinned in `package.json`. These primitives have:

- Trail of Bits and OpenZeppelin-internal audits for v5.
- Thousands of production deployments without a primitive-level break.

The custom code surface of `StableYieldVault` is **~150 lines** and consists almost entirely of:
- Constructor (passes args to OZ constructors),
- Six `super.*` overrides that add `nonReentrant` + `whenNotPaused` + zero-amount guards,
- `fundRewards`, `pause`, `unpause`, `rescueToken`, `pricePerShare`.

There is no custom share-accounting, no custom reward accrual, no custom token transfers.

## 3. Threat model & mitigations

| # | Threat | Mitigation |
|---|--------|-----------|
| 1 | **Reentrancy (deposit / withdraw / mint / redeem / fundRewards / rescueToken)** | `ReentrancyGuard` + `nonReentrant` on every external state-mutating entrypoint. Checks-effects-interactions pattern inherited from OZ ERC4626. |
| 2 | **ERC-4626 inflation attack (first depositor donation griefing)** | `_decimalsOffset()` returns `6`, creating `10^6` virtual shares per unit of underlying. OZ's documented mitigation. Empirically, a $1M donation griefing attack loses far more than it can extract from a new $100 depositor. |
| 3 | **Owner drains user funds** | `rescueToken` explicitly reverts with `CannotRescueUnderlyingAsset` when called on `asset()`. There is **no other function** that transfers the underlying out of the contract except ERC-4626 `withdraw/redeem`, which only burns the caller's own shares. |
| 4 | **Owner bricks the vault / blocks withdrawals** | Pause gate is only on `deposit` and `mint`. `withdraw` and `redeem` are NEVER pausable — users can always exit. |
| 5 | **Owner inflates their own share balance** | The owner has no mint privilege. The only way to mint shares is the public `deposit` / `mint` functions which require a real transfer of `asset()` in. |
| 6 | **Accidental ownership loss / malicious take-over** | `Ownable2Step` requires the new owner to explicitly `acceptOwnership` — no transfer to dead addresses or typos. |
| 7 | **Integer overflow / underflow** | Solidity 0.8.28, all arithmetic is checked by default. No `unchecked` blocks exist in `StableYieldVault`. |
| 8 | **Fee-on-transfer / rebasing tokens** | Out of scope: this vault is explicitly designed for static 6-decimal stablecoins (USDC, EURC, EURW). Deploying it against a rebasing or fee-on-transfer token would break share accounting — the deploy script hard-codes supported assets per chain. |
| 9 | **Dust / zero-amount edge cases** | `deposit(0)`, `mint(0)`, `withdraw(0)`, `redeem(0)`, `fundRewards(0)` all revert with `ZeroAmount`. |
| 10 | **Donation-based share price manipulation after launch** | After the first deposit exists, share price manipulation via donation still increases price for ALL existing holders proportionally. Attacker pays to boost every holder, so this is economically irrational. |
| 11 | **Front-running sandwich on share price** | Share price changes only when `totalAssets` changes — which happens on user deposit/withdraw (no-op effect on pps) and `fundRewards` (price bumps). There is no MEV-extractable price movement between two normal user actions. |
| 12 | **Cross-contract reentry via ERC-777 hooks** | The whitelisted assets (USDC / EURC / EURW) are all plain ERC-20, no ERC-777 hooks. Even if a hook existed, `nonReentrant` would block reentry. |
| 13 | **`approve` race condition on rescue** | `rescueToken` uses `SafeERC20.safeTransfer`, not `transferFrom`. No external allowance races. |
| 14 | **`onERC1155Received` / `onERC721Received` griefing** | Vault does not implement either — non-fungible assets cannot be deposited. |
| 15 | **Delegatecall / proxy-storage corruption** | Contract is a concrete, non-upgradeable deployment. No `delegatecall`, no fallback, no upgrade path. |
| 16 | **Griefing via tiny dust rewards raising gas** | `fundRewards` is a simple `safeTransferFrom` + event. No per-holder iteration. Griefing is uneconomical. |
| 17 | **Access-control bypass on pause / rescue** | Both gated by OZ `onlyOwner`. Unit-testable and used in countless audited deployments. |
| 18 | **Flash-loan drain** | Flash loans are orthogonal to a single-asset vault with no oracle, no LP pricing, and no external dependencies. The worst a flash loan can do is deposit + withdraw in the same block, which nets to zero (minus gas). |
| 19 | **Malicious underlying token** | Deploy script only wires to canonical USDC / EURC / EURW on Arc / Base / Monad. For any other chain, deployer must explicitly provide `USDC_ADDRESS` / `EUR_STABLE_ADDRESS` env. |

## 4. Explicit non-promises

- We do **not** promise:
  - That OpenZeppelin is bug-free (it isn't; it just has the best track record).
  - That the underlying stablecoins never de-peg or get censored.
  - That the frontend is free of bugs that could trick a user into signing the wrong tx.
  - That no zero-day Solidity compiler bug will ever affect this bytecode.
- We **do** commit:
  - No `unchecked` arithmetic, no `assembly`, no `delegatecall`, no `selfdestruct`.
  - No admin path to user principal.
  - Immutable deployments — bugs are fixed by re-deploying a v2 and letting users migrate.

## 5. Pre-deployment checklist

- [x] `npx hardhat compile` clean with Solidity 0.8.28 + `viaIR` + optimiser.
- [x] All OZ imports pinned to `@openzeppelin/contracts ^5.6.1`.
- [x] Deploy script hard-codes canonical stables per chain; `VAULT_OWNER` defaults to deployer but supports a multisig override.
- [ ] **Recommended before mainnet TVL > $100k:** external audit (Trail of Bits, Zellic, OpenZeppelin, Spearbit).
- [ ] **Recommended before mainnet:** transfer ownership to a Safe multisig (`npm run deploy:yield-vault:<chain>` with `VAULT_OWNER=0xSafe…`).
- [ ] **Recommended for launch:** cap initial deposits via `pause()` while seeding rewards, unpause once TVL + rewards are sanity-checked.

## 6. Operational runbook

- **Funding yield:** call `fundRewards(amount)` from treasury. Requires prior `approve` of the underlying to the vault.
- **Pause:** `pause()` from owner halts new deposits. Users can still redeem.
- **Rescue stray token:** `rescueToken(token, to, amount)` — reverts for the underlying.
- **Ownership rotation:** `transferOwnership(newOwner)` → new owner calls `acceptOwnership()`.

## 7. Out of scope (future work)

- Reward emissions schedule (currently owner pushes rewards manually).
- Per-user lockups / tiered APR.
- Cross-chain share redemption.
- Loss-absorbing insurance fund.
