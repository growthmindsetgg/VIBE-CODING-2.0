import { network } from "hardhat";
import { formatUnits, parseUnits } from "viem";

/**
 * Idempotent seeder for the already-deployed ForexTradingAgent.
 *
 * Reads AGENT_ADDR env (fallback: the canonical address below). Skips
 * approvals that are already sufficient, then calls deposit().
 */

const DEFAULT_AGENT = "0xb5b5b3d78130b322aeb9b5d6762c69070c398e07" as `0x${string}`;
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
const BASE_EURC = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as `0x${string}`;

const erc20Abi = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "a", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "o", type: "address" },
      { name: "s", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const agentAbi = [
  {
    inputs: [
      { name: "usdcIn", type: "uint256" },
      { name: "eurcIn", type: "uint256" },
      { name: "minShares", type: "uint256" },
    ],
    name: "deposit",
    outputs: [{ name: "mintedShares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "totalReserves",
    outputs: [
      { name: "u", type: "uint256" },
      { name: "e", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "navUsdc",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "pool",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "a", type: "address" }],
    name: "shares",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  if (!wallet?.account) {
    console.error("No signer: set DEPLOYER_PRIVATE_KEY.");
    process.exitCode = 1;
    return;
  }
  const deployer = wallet.account.address;
  const pc = await viem.getPublicClient();
  const agent = (process.env.AGENT_ADDR?.trim() || DEFAULT_AGENT) as `0x${string}`;

  console.log(`Agent:    ${agent}`);
  console.log(`Deployer: ${deployer}`);

  const poolAddr = (await pc.readContract({
    address: agent,
    abi: agentAbi,
    functionName: "pool",
  })) as `0x${string}`;
  console.log(`Aerodrome pool: ${poolAddr}`);

  const seedUsdc = process.env.SEED_USDC?.trim()
    ? parseUnits(process.env.SEED_USDC.trim(), 6)
    : parseUnits("1", 6);
  const seedEurc = process.env.SEED_EURC?.trim()
    ? parseUnits(process.env.SEED_EURC.trim(), 6)
    : parseUnits("0.9", 6);

  console.log(`Seed:     ${formatUnits(seedUsdc, 6)} USDC + ${formatUnits(seedEurc, 6)} EURC`);

  const [usdcBal, eurcBal] = (await Promise.all([
    pc.readContract({ address: BASE_USDC, abi: erc20Abi, functionName: "balanceOf", args: [deployer] }),
    pc.readContract({ address: BASE_EURC, abi: erc20Abi, functionName: "balanceOf", args: [deployer] }),
  ])) as [bigint, bigint];
  console.log(`Wallet:   ${formatUnits(usdcBal, 6)} USDC, ${formatUnits(eurcBal, 6)} EURC`);
  if (usdcBal < seedUsdc || eurcBal < seedEurc) {
    console.error("Seed amounts exceed wallet balance — abort.");
    process.exitCode = 1;
    return;
  }

  const [allowU, allowE] = (await Promise.all([
    pc.readContract({ address: BASE_USDC, abi: erc20Abi, functionName: "allowance", args: [deployer, agent] }),
    pc.readContract({ address: BASE_EURC, abi: erc20Abi, functionName: "allowance", args: [deployer, agent] }),
  ])) as [bigint, bigint];

  if (seedUsdc > 0n && allowU < seedUsdc) {
    const h = await wallet.writeContract({
      address: BASE_USDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [agent, seedUsdc],
    });
    await pc.waitForTransactionReceipt({ hash: h });
    console.log(`Approved USDC: ${h}`);
  } else {
    console.log(`USDC already approved: ${formatUnits(allowU, 6)}`);
  }
  if (seedEurc > 0n && allowE < seedEurc) {
    const h = await wallet.writeContract({
      address: BASE_EURC,
      abi: erc20Abi,
      functionName: "approve",
      args: [agent, seedEurc],
    });
    await pc.waitForTransactionReceipt({ hash: h });
    console.log(`Approved EURC: ${h}`);
  } else {
    console.log(`EURC already approved: ${formatUnits(allowE, 6)}`);
  }

  const h = await wallet.writeContract({
    address: agent,
    abi: agentAbi,
    functionName: "deposit",
    args: [seedUsdc, seedEurc, 0n],
  });
  console.log(`Deposit tx: ${h}`);
  const rc = await pc.waitForTransactionReceipt({ hash: h });
  console.log(`Deposit status: ${rc.status}`);

  const [u, e] = (await pc.readContract({
    address: agent,
    abi: agentAbi,
    functionName: "totalReserves",
  })) as [bigint, bigint];
  const nav = (await pc.readContract({
    address: agent,
    abi: agentAbi,
    functionName: "navUsdc",
  })) as bigint;
  const s = (await pc.readContract({
    address: agent,
    abi: agentAbi,
    functionName: "shares",
    args: [deployer],
  })) as bigint;

  console.log(`Reserves: ${formatUnits(u, 6)} USDC + ${formatUnits(e, 6)} EURC`);
  console.log(`NAV:      ${formatUnits(nav, 6)} USDC`);
  console.log(`Shares:   ${s.toString()} (deployer)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
