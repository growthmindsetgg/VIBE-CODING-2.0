import { network } from "hardhat";
import { formatUnits } from "viem";

/** Withdraw all non-DEAD shares from a deployed ForexTradingAgent (used to
 *  unwind the v1 seed before redeploying with a fix). */

const agentAbi = [
  {
    inputs: [{ name: "a", type: "address" }],
    name: "shares",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "sharesIn", type: "uint256" },
      { name: "minUsdcOut", type: "uint256" },
      { name: "minEurcOut", type: "uint256" },
    ],
    name: "withdraw",
    outputs: [
      { name: "u", type: "uint256" },
      { name: "e", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  if (!wallet?.account) throw new Error("no signer");
  const deployer = wallet.account.address;
  const pc = await viem.getPublicClient();
  const agent = (process.env.AGENT_ADDR?.trim() ||
    "0xb5b5b3d78130b322aeb9b5d6762c69070c398e07") as `0x${string}`;

  const s = (await pc.readContract({
    address: agent,
    abi: agentAbi,
    functionName: "shares",
    args: [deployer],
  })) as bigint;
  console.log(`Agent: ${agent}`);
  console.log(`Shares: ${s.toString()}`);
  if (s === 0n) {
    console.log("Nothing to withdraw.");
    return;
  }

  const h = await wallet.writeContract({
    address: agent,
    abi: agentAbi,
    functionName: "withdraw",
    args: [s, 0n, 0n],
  });
  console.log(`Withdraw tx: ${h}`);
  const rc = await pc.waitForTransactionReceipt({ hash: h });
  console.log(`Status: ${rc.status}`);
  console.log(
    `Recovered from receipt gasUsed=${rc.gasUsed.toString()}; run seed-forex-agent against the NEW deployment.`,
  );
  void formatUnits; // unused in this script — suppress lint
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
