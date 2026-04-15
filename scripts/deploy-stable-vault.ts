import { network } from "hardhat";

/** Arc testnet canonical 6-decimal stables (override via env). */
const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_EUR_STABLE = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

/** Base mainnet — Circle native USDC + EURC. */
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BASE_EUR_STABLE = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const;

/** Monad mainnet — Circle USDC + EURW placeholder (replace EUR_STABLE_ADDRESS if production EURW differs). */
const MONAD_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
const MONAD_EUR_STABLE = "0x41cff055c42b65fb1712191c8564f17e318d47c8" as const;

const CHAIN_BASE = 8453;
const CHAIN_MONAD = 143;

function defaultsForChainId(chainId: number): { usdc: `0x${string}`; eurStable: `0x${string}` } {
  if (chainId === CHAIN_BASE) {
    return { usdc: BASE_USDC, eurStable: BASE_EUR_STABLE };
  }
  if (chainId === CHAIN_MONAD) {
    return { usdc: MONAD_USDC, eurStable: MONAD_EUR_STABLE };
  }
  return { usdc: ARC_USDC, eurStable: ARC_EUR_STABLE };
}

/**
 * Deploy StableSwapMicroVault on the selected Hardhat network.
 *
 * Env:
 * - `USDC_ADDRESS` — override USDC (optional; network defaults above)
 * - `EUR_STABLE_ADDRESS` or `EURC_ADDRESS` — override euro-side token (EURC on Arc/Base, EURW on Monad)
 * - `EURC_USD_1E18` — fixed USD per 1 euro-stable, 1e18 (default 1.08e18)
 */
async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  if (!wallet?.account) {
    console.error(
      'No local signer: set DEPLOYER_PRIVATE_KEY for the target network, or use accounts: "remote".',
    );
    process.exitCode = 1;
    return;
  }
  const deployer = wallet.account.address;
  const publicClient = await viem.getPublicClient();
  const chainId = Number(await publicClient.getChainId());
  const d = defaultsForChainId(chainId);

  const usdc = (process.env.USDC_ADDRESS?.trim() || d.usdc) as `0x${string}`;
  const eurStable = (
    process.env.EUR_STABLE_ADDRESS?.trim() ||
    process.env.EURC_ADDRESS?.trim() ||
    d.eurStable
  ) as `0x${string}`;
  const priceRaw = process.env.EURC_USD_1E18 ?? "1080000000000000000";

  const usdPerEurStable1e18 = BigInt(priceRaw);
  const vault = await viem.deployContract("StableSwapMicroVault", [
    usdc,
    eurStable,
    usdPerEurStable1e18,
    deployer,
  ]);

  const nextPublicHint =
    chainId === CHAIN_BASE
      ? "Set NEXT_PUBLIC_BASE_VAULT_ADDRESS=" + vault.address
      : chainId === CHAIN_MONAD
        ? "Set NEXT_PUBLIC_MONAD_VAULT_ADDRESS=" + vault.address
        : "Set NEXT_PUBLIC_STABLE_VAULT_ADDRESS=" + vault.address;

  console.log(
    JSON.stringify(
      {
        chainId,
        deployer,
        stableSwapMicroVault: vault.address,
        usdc,
        eurStable,
        usdPerEurStable1e18: usdPerEurStable1e18.toString(),
        nextPublicHint,
        note: "Pool: addLiquidity first, then swaps work.",
      },
      null,
      2,
    ),
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
