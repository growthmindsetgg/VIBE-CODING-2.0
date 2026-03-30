import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  const deployer = wallet.account.address;

  const fundName = process.env.VIBEFUND_SHARE_NAME ?? "VibeFund Share";
  const fundSymbol = process.env.VIBEFUND_SHARE_SYMBOL ?? "VFS";
  const baseURI = process.env.VIBEFUND_NFT_BASE_URI ?? "https://vibefunds.xyz/nft/";

  const nft = await viem.deployContract("VibeFundShareNFT", [
    `${fundName} NFT`,
    `${fundSymbol}N`,
    baseURI,
  ]);

  const token = await viem.deployContract("VibeFundShareToken", [
    fundName,
    fundSymbol,
    nft.address,
  ]);

  await nft.write.setToken([token.address], { account: deployer });

  console.log(JSON.stringify({ deployer, nft: nft.address, token: token.address }, null, 2));

  const usdc = process.env.USDC_ADDRESS as `0x${string}` | undefined;
  if (usdc) {
    const fundManager = await viem.deployContract("FundManager", [usdc, deployer]);
    await fundManager.write.setShareToken([token.address], { account: deployer });
    await token.write.transferOwnership([fundManager.address], { account: deployer });
    console.log(
      JSON.stringify(
        {
          fundManager: fundManager.address,
          note: "Share token owner is now FundManager — users can call subscribe(usdc) after USDC approve.",
        },
        null,
        2,
      ),
    );
  } else {
    console.log("USDC_ADDRESS not set; skipped FundManager (set for Arc testnet deploy).");
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
