import { network } from "hardhat";
import { formatEther } from "viem";

async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  if (!wallet?.account) {
    console.error("No local signer");
    process.exitCode = 1;
    return;
  }
  const publicClient = await viem.getPublicClient();
  const chainId = Number(await publicClient.getChainId());
  const balance = await publicClient.getBalance({ address: wallet.account.address });

  console.log(
    JSON.stringify(
      {
        chainId,
        deployer: wallet.account.address,
        nativeBalance: formatEther(balance),
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
