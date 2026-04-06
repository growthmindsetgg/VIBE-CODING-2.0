import { network } from "hardhat";

/** Deploy StableSwapMicroVault on Arc (or any network). Requires USDC_ADDRESS + EURC_ADDRESS. */
async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  const deployer = wallet.account.address;

  const usdc = process.env.USDC_ADDRESS as `0x${string}` | undefined;
  const eurc = process.env.EURC_ADDRESS as `0x${string}` | undefined;
  const priceRaw = process.env.EURC_USD_1E18 ?? "1080000000000000000";

  if (!usdc || !eurc) {
    console.error("Set USDC_ADDRESS and EURC_ADDRESS (both 0x…, 6-decimal tokens on this chain).");
    process.exitCode = 1;
    return;
  }

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
