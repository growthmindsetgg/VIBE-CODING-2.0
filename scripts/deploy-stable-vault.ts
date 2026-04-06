import { network } from "hardhat";

/** Arc testnet canonical 6-decimal stables (override via USDC_ADDRESS / EURC_ADDRESS). */
const DEFAULT_USDC = "0x3600000000000000000000000000000000000000" as const;
const DEFAULT_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

/** Deploy StableSwapMicroVault on Arc (or any network). Defaults USDC/EURC to Arc testnet addresses. */
async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  const deployer = wallet.account.address;

  const usdc = (process.env.USDC_ADDRESS || DEFAULT_USDC) as `0x${string}`;
  const eurc = (process.env.EURC_ADDRESS || DEFAULT_EURC) as `0x${string}`;
  const priceRaw = process.env.EURC_USD_1E18 ?? "1080000000000000000";

  const usdPerEurc1e18 = BigInt(priceRaw);
  const vault = await viem.deployContract("StableSwapMicroVault", [usdc, eurc, usdPerEurc1e18, deployer]);

  console.log(
    JSON.stringify(
      {
        deployer,
        stableSwapMicroVault: vault.address,
        usdc,
        eurc,
        usdPerEurc1e18: usdPerEurc1e18.toString(),
        note: "Set NEXT_PUBLIC_STABLE_VAULT_ADDRESS in the app. Pool: addLiquidity first, then swaps work.",
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
