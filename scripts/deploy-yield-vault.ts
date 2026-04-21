import { network } from "hardhat";

/** Arc testnet canonical 6-decimal stables. */
const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_EUR_STABLE = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;
const ARC_EUR_SYMBOL = "EURC";

/** Base mainnet — Circle native USDC + EURC. */
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BASE_EUR_STABLE = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const;
const BASE_EUR_SYMBOL = "EURC";

/** Monad mainnet — Circle USDC + Newrails EURW. */
const MONAD_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
const MONAD_EUR_STABLE = "0x1111b3ded9f1fe1801ad4ebef8e2788183a24111" as const;
const MONAD_EUR_SYMBOL = "EURW";

const CHAIN_BASE = 8453;
const CHAIN_MONAD = 143;

type Defaults = {
  usdc: `0x${string}`;
  eurStable: `0x${string}`;
  eurSymbol: string;
  chainSlug: "arc" | "base" | "monad";
};

function defaultsForChainId(chainId: number): Defaults {
  if (chainId === CHAIN_BASE) {
    return { usdc: BASE_USDC, eurStable: BASE_EUR_STABLE, eurSymbol: BASE_EUR_SYMBOL, chainSlug: "base" };
  }
  if (chainId === CHAIN_MONAD) {
    return {
      usdc: MONAD_USDC,
      eurStable: MONAD_EUR_STABLE,
      eurSymbol: MONAD_EUR_SYMBOL,
      chainSlug: "monad",
    };
  }
  return { usdc: ARC_USDC, eurStable: ARC_EUR_STABLE, eurSymbol: ARC_EUR_SYMBOL, chainSlug: "arc" };
}

/**
 * Deploy two StableYieldVaults (USDC + EUR stable) on the selected Hardhat network.
 *
 * Env overrides:
 * - USDC_ADDRESS
 * - EUR_STABLE_ADDRESS | EURC_ADDRESS
 * - EUR_STABLE_SYMBOL  (default EURC on Arc/Base, EURW on Monad)
 * - VAULT_OWNER        (default = deployer; set to multisig for production)
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
  const eurSymbol = process.env.EUR_STABLE_SYMBOL?.trim() || d.eurSymbol;
  const owner = (process.env.VAULT_OWNER?.trim() || deployer) as `0x${string}`;

  const usdcVault = await viem.deployContract("StableYieldVault", [
    usdc,
    "Vibefunds Staked USDC",
    "sUSDC",
    owner,
  ]);

  const eurVault = await viem.deployContract("StableYieldVault", [
    eurStable,
    `Vibefunds Staked ${eurSymbol}`,
    `s${eurSymbol}`,
    owner,
  ]);

  const envKeyPrefix =
    d.chainSlug === "arc" ? "NEXT_PUBLIC_ARC" : d.chainSlug === "base" ? "NEXT_PUBLIC_BASE" : "NEXT_PUBLIC_MONAD";

  console.log(
    JSON.stringify(
      {
        chainId,
        deployer,
        owner,
        underlying: { usdc, eurStable, eurSymbol },
        usdcYieldVault: usdcVault.address,
        eurYieldVault: eurVault.address,
        envHint: {
          [`${envKeyPrefix}_USDC_YIELD_VAULT`]: usdcVault.address,
          [`${envKeyPrefix}_EUR_YIELD_VAULT`]: eurVault.address,
        },
        note: "Owner can pause deposits and fund rewards. Owner CANNOT withdraw user principal or share supply.",
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
