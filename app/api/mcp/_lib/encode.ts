/**
 * Pure calldata encoders for the MCP plugin's prepare-* routes.
 *
 * No I/O, no env reads, no chain dispatch — these are stateless functions
 * that turn typed args into hex calldata. ABI imports come from `lib/abis/*`
 * so behavior stays in lockstep with the in-app write paths.
 *
 * Builder Code suffix wiring is intentionally deferred — see
 * docs/STAGE-1-SHIPPED.md → "Builder Code suffix wiring for MCP API routes".
 */

import { encodeFunctionData, parseAbi } from "viem";

import { baseForexVaultAbi } from "@/lib/abis/base-forex-vault";
import { forexTradingAgentAbi } from "@/lib/abis/forex-trading-agent";
import { stableYieldVaultAbi } from "@/lib/abis/stable-yield-vault";

const erc20ApproveAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

/** ERC-20 `approve(spender, amount)`. */
export function encodeErc20Approve(
  spender: `0x${string}`,
  amount: bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [spender, amount],
  });
}

/** Standard ERC-4626 `deposit(assets, receiver)` — used for stable-yield vaults. */
export function encodeErc4626Deposit(
  assets: bigint,
  receiver: `0x${string}`,
): `0x${string}` {
  return encodeFunctionData({
    abi: stableYieldVaultAbi,
    functionName: "deposit",
    args: [assets, receiver],
  });
}

/**
 * Base forex agent `deposit(usdcIn, eurcIn, minShares)`. Not ERC-4626.
 *
 * For the MCP plugin we deposit USDC-only (eurcIn = 0) per the locked scope
 * decision — dual-token support can come later.
 */
export function encodeForexAgentDeposit(
  usdcIn: bigint,
  eurcIn: bigint,
  minShares: bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: forexTradingAgentAbi,
    functionName: "deposit",
    args: [usdcIn, eurcIn, minShares],
  });
}

/**
 * BaseForexVault `deposit(usdcIn, eurcIn, minLp, minShares)` — re-exported
 * encoder kept here so Phase 2 has the option of routing forex-vault deposits
 * through MCP without re-introducing an ABI import elsewhere. Unused for now.
 */
export function encodeBaseForexVaultDeposit(
  usdcIn: bigint,
  eurcIn: bigint,
  minLp: bigint,
  minShares: bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: baseForexVaultAbi,
    functionName: "deposit",
    args: [usdcIn, eurcIn, minLp, minShares],
  });
}
