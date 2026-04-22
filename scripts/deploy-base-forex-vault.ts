import { network } from "hardhat";
import { formatEther, formatUnits, parseUnits } from "viem";

/**
 * Deploy BaseForexVault to Base mainnet.
 *
 * Flow:
 * 1. Sanity-check deployer has enough ETH for gas (bails early if not).
 * 2. Deploy the vault — constructor derives the Aerodrome stable-pool
 *    address from the router's defaultFactory() and poolFor(USDC, EURC, true).
 * 3. Optionally seed with SEED_USDC + SEED_EURC via the vault's own
 *    `deposit()` (approves + deposits — so the deployer becomes the first
 *    LP, locking MIN_SHARES forever).
 *
 * Env:
 * - BASE_USDC_ADDRESS     (override; default Circle USDC on Base)
 * - BASE_EURC_ADDRESS     (override; default Circle EURC on Base)
 * - BASE_AERODROME_ROUTER (override; default 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43)
 * - VAULT_OWNER           (override; default = deployer)
 * - SEED_USDC             (human, 6dp; default "0")
 * - SEED_EURC             (human, 6dp; default "0")
 */

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BASE_EURC = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const;
const AERO_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as const;

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
    name: "pool",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalReserves",
    outputs: [
      { name: "usdcReserve", type: "uint256" },
      { name: "eurcReserve", type: "uint256" },
    ],
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
  const publicClient = await viem.getPublicClient();
  const chainId = Number(await publicClient.getChainId());
  if (chainId !== 8453) {
    console.error(`Wrong chain: expected Base (8453), got ${chainId}.`);
    process.exitCode = 1;
    return;
  }

  const ethBal = await publicClient.getBalance({ address: deployer });
  console.log(`Deployer: ${deployer}`);
  console.log(`Base ETH balance: ${formatEther(ethBal)} ETH`);
  if (ethBal < 1_500_000_000_000_000n) {
    console.error("Base ETH balance below 0.0015 ETH — top up before deploying.");
    process.exitCode = 1;
    return;
  }

  const usdc = (process.env.BASE_USDC_ADDRESS?.trim() || BASE_USDC) as `0x${string}`;
  const eurc = (process.env.BASE_EURC_ADDRESS?.trim() || BASE_EURC) as `0x${string}`;
  const router = (process.env.BASE_AERODROME_ROUTER?.trim() || AERO_ROUTER) as `0x${string}`;
  const owner = (process.env.VAULT_OWNER?.trim() || deployer) as `0x${string}`;

  console.log(`USDC:   ${usdc}`);
  console.log(`EURC:   ${eurc}`);
  console.log(`Router: ${router}`);
  console.log(`Owner:  ${owner}`);

  const usdcBal = (await publicClient.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [deployer],
  })) as bigint;
  const eurcBal = (await publicClient.readContract({
    address: eurc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [deployer],
  })) as bigint;
  console.log(
    `Deployer balances: ${formatUnits(usdcBal, 6)} USDC, ${formatUnits(eurcBal, 6)} EURC`,
  );

  // Deploy
  const vault = await viem.deployContract("BaseForexVault", [usdc, eurc, router, owner]);
  console.log(`Deployed BaseForexVault: ${vault.address}`);

  const poolAddr = (await publicClient.readContract({
    address: vault.address,
    abi: vaultAbi,
    functionName: "pool",
  })) as `0x${string}`;
  console.log(`Aerodrome USDC/EURC stable pool: ${poolAddr}`);

  // Seed
  const seedUsdc = process.env.SEED_USDC?.trim()
    ? parseUnits(process.env.SEED_USDC.trim(), 6)
    : 0n;
  const seedEurc = process.env.SEED_EURC?.trim()
    ? parseUnits(process.env.SEED_EURC.trim(), 6)
    : 0n;

  if (seedUsdc > 0n || seedEurc > 0n) {
    if (seedUsdc > usdcBal || seedEurc > eurcBal) {
      console.error(
        `Seed amounts exceed deployer balance. Want ${formatUnits(seedUsdc, 6)} USDC + ${formatUnits(seedEurc, 6)} EURC.`,
      );
      process.exitCode = 1;
      return;
    }

    if (seedUsdc > 0n) {
      const h = await wallet.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault.address, seedUsdc],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      console.log(`Approved USDC: ${h}`);
    }
    if (seedEurc > 0n) {
      const h = await wallet.writeContract({
        address: eurc,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault.address, seedEurc],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      console.log(`Approved EURC: ${h}`);
    }

    const h = await wallet.writeContract({
      address: vault.address,
      abi: vaultAbi,
      functionName: "deposit",
      args: [seedUsdc, seedEurc, 0n, 0n],
    });
    const rc = await publicClient.waitForTransactionReceipt({ hash: h });
    console.log(`Seeded deposit tx: ${h} (status=${rc.status})`);
  }

  const [usdcReserve, eurcReserve] = (await publicClient.readContract({
    address: vault.address,
    abi: vaultAbi,
    functionName: "totalReserves",
  })) as [bigint, bigint];

  console.log(
    JSON.stringify(
      {
        chainId,
        deployer,
        owner,
        baseForexVault: vault.address,
        aerodromePool: poolAddr,
        usdc,
        eurc,
        router,
        seeded: {
          usdc: formatUnits(seedUsdc, 6),
          eurc: formatUnits(seedEurc, 6),
        },
        reserves: {
          usdc: formatUnits(usdcReserve, 6),
          eurc: formatUnits(eurcReserve, 6),
        },
        envHint: { NEXT_PUBLIC_BASE_FOREX_VAULT: vault.address },
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
