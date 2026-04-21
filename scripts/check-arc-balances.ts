import { network } from "hardhat";
import { formatUnits } from "viem";

const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  if (!wallet?.account) return;
  const publicClient = await viem.getPublicClient();

  const erc20 = [
    {
      inputs: [{ name: "a", type: "address" }],
      name: "balanceOf",
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function",
    },
  ] as const;

  const usdcBal = await publicClient.readContract({
    address: ARC_USDC,
    abi: erc20,
    functionName: "balanceOf",
    args: [wallet.account.address],
  });
  const eurcBal = await publicClient.readContract({
    address: ARC_EURC,
    abi: erc20,
    functionName: "balanceOf",
    args: [wallet.account.address],
  });
  const nativeBal = await publicClient.getBalance({ address: wallet.account.address });

  console.log(
    JSON.stringify(
      {
        address: wallet.account.address,
        native: formatUnits(nativeBal, 18),
        usdc6dp: formatUnits(usdcBal, 6),
        eurc6dp: formatUnits(eurcBal, 6),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
