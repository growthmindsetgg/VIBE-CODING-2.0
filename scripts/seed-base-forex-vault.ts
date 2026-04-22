import { network } from "hardhat";
import { formatEther, formatUnits, parseUnits } from "viem";

/**
 * Seed an already-deployed BaseForexVault with USDC + EURC via its
 * own `deposit()` — approves both tokens and calls deposit. The
 * deployer becomes the first LP, so MIN_SHARES (1e-6 shares) is locked
 * at the DEAD address. Remaining shares stay with the deployer and can
 * later be redeemed.
 *
 * Env:
 * - VAULT_ADDR    (required) address of the deployed vault
 * - SEED_USDC     human 6dp; default "0"
 * - SEED_EURC     human 6dp; default "0"
 */

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BASE_EURC = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const;

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

const vaultAbi = [
  {
    inputs: [
      { name: "usdcIn", type: "uint256" },
      { name: "eurcIn", type: "uint256" },
      { name: "minLp", type: "uint256" },
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
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "shares",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalShares",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function main() {
  const vault = (process.env.VAULT_ADDR?.trim() ||
    "0x1a3cb640ee31ecd31760b138b2dbdfbc5ca46dcb") as `0x${string}`;

  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  if (!wallet?.account) {
    console.error("No signer");
    process.exitCode = 1;
    return;
  }
  const pc = await viem.getPublicClient();
  const deployer = wallet.account.address;

  const ethBal = await pc.getBalance({ address: deployer });
  console.log(`Deployer: ${deployer}`);
  console.log(`ETH: ${formatEther(ethBal)}`);

  const usdcBal = (await pc.readContract({
    address: BASE_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [deployer],
  })) as bigint;
  const eurcBal = (await pc.readContract({
    address: BASE_EURC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [deployer],
  })) as bigint;
  console.log(`USDC: ${formatUnits(usdcBal, 6)} · EURC: ${formatUnits(eurcBal, 6)}`);

  const seedUsdc = parseUnits(process.env.SEED_USDC?.trim() || "0", 6);
  const seedEurc = parseUnits(process.env.SEED_EURC?.trim() || "0", 6);
  if (seedUsdc === BigInt(0) && seedEurc === BigInt(0)) {
    console.log("Nothing to seed (SEED_USDC/SEED_EURC both 0).");
    return;
  }
  if (seedUsdc > usdcBal || seedEurc > eurcBal) {
    console.error("Seed exceeds balance.");
    process.exitCode = 1;
    return;
  }

  const curUsdcAllow = (await pc.readContract({
    address: BASE_USDC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [deployer, vault],
  })) as bigint;
  const curEurcAllow = (await pc.readContract({
    address: BASE_EURC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [deployer, vault],
  })) as bigint;

  if (seedUsdc > BigInt(0) && curUsdcAllow < seedUsdc) {
    const h = await wallet.writeContract({
      address: BASE_USDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [vault, seedUsdc],
    });
    await pc.waitForTransactionReceipt({ hash: h });
    console.log(`approve USDC: ${h}`);
  } else if (seedUsdc > BigInt(0)) {
    console.log(`USDC allowance already sufficient (${formatUnits(curUsdcAllow, 6)}).`);
  }
  if (seedEurc > BigInt(0) && curEurcAllow < seedEurc) {
    const h = await wallet.writeContract({
      address: BASE_EURC,
      abi: erc20Abi,
      functionName: "approve",
      args: [vault, seedEurc],
    });
    await pc.waitForTransactionReceipt({ hash: h });
    console.log(`approve EURC: ${h}`);
  } else if (seedEurc > BigInt(0)) {
    console.log(`EURC allowance already sufficient (${formatUnits(curEurcAllow, 6)}).`);
  }

  const h = await wallet.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "deposit",
    args: [seedUsdc, seedEurc, BigInt(0), BigInt(0)],
  });
  const rc = await pc.waitForTransactionReceipt({ hash: h });
  console.log(`deposit tx: ${h} (status=${rc.status})`);

  const [r0, r1] = (await pc.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalReserves",
  })) as [bigint, bigint];
  const ts = (await pc.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalShares",
  })) as bigint;
  const ms = (await pc.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "shares",
    args: [deployer],
  })) as bigint;

  console.log(
    JSON.stringify(
      {
        vault,
        reserves: { usdc: formatUnits(r0, 6), eurc: formatUnits(r1, 6) },
        totalShares: ts.toString(),
        deployerShares: ms.toString(),
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
