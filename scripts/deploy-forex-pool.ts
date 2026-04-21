import { network } from "hardhat";
import { formatUnits, parseUnits } from "viem";

/**
 * Deploy ForexPool to Arc testnet.
 *
 * Flow:
 * 1. Deploy new ForexPool with initial price.
 * 2. (Optional) Drain old ForexTrader reserves back to deployer if OLD_FOREX_TRADER set.
 * 3. Seed the new pool by calling addLiquidity with SEED_USDC / SEED_EURC.
 *
 * Env:
 * - INITIAL_PRICE_1E18  (default 1080000000000000000)
 * - SEED_USDC           (human, 6dp; default "0")
 * - SEED_EURC           (human, 6dp; default "0")
 * - OLD_FOREX_TRADER    (address; if set, drain its USDC+EURC reserves to deployer first)
 * - FX_USDC_ADDRESS / FX_EURC_ADDRESS (overrides)
 */

const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

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
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const oldTraderAbi = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "withdrawReserve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "reserves",
    outputs: [
      { name: "usdcReserve", type: "uint256" },
      { name: "eurcReserve", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const poolAbi = [
  {
    inputs: [
      { name: "usdcIn", type: "uint256" },
      { name: "eurcIn", type: "uint256" },
      { name: "minLpOut", type: "uint256" },
    ],
    name: "addLiquidity",
    outputs: [{ name: "lpMinted", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  if (!wallet?.account) {
    console.error("No local signer: set DEPLOYER_PRIVATE_KEY for arc-testnet.");
    process.exitCode = 1;
    return;
  }
  const deployer = wallet.account.address;
  const publicClient = await viem.getPublicClient();
  const chainId = Number(await publicClient.getChainId());

  const usdc = (process.env.FX_USDC_ADDRESS?.trim() || ARC_USDC) as `0x${string}`;
  const eurc = (process.env.FX_EURC_ADDRESS?.trim() || ARC_EURC) as `0x${string}`;
  const initialPrice = BigInt(process.env.INITIAL_PRICE_1E18 || "1080000000000000000");

  // ---------------------------------------------------------------------------
  // Step 1: drain old ForexTrader if provided
  // ---------------------------------------------------------------------------
  const oldTrader = process.env.OLD_FOREX_TRADER?.trim() as `0x${string}` | undefined;
  if (oldTrader && oldTrader.length === 42) {
    const [oldUsdc, oldEurc] = (await publicClient.readContract({
      address: oldTrader,
      abi: oldTraderAbi,
      functionName: "reserves",
    })) as [bigint, bigint];
    console.log(
      `Old trader reserves: ${formatUnits(oldUsdc, 6)} USDC + ${formatUnits(oldEurc, 6)} EURC`,
    );
    if (oldUsdc > 0n) {
      const h = await wallet.writeContract({
        address: oldTrader,
        abi: oldTraderAbi,
        functionName: "withdrawReserve",
        args: [usdc, deployer, oldUsdc],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      console.log(`  drained USDC: ${h}`);
    }
    if (oldEurc > 0n) {
      const h = await wallet.writeContract({
        address: oldTrader,
        abi: oldTraderAbi,
        functionName: "withdrawReserve",
        args: [eurc, deployer, oldEurc],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      console.log(`  drained EURC: ${h}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2: deploy new ForexPool
  // ---------------------------------------------------------------------------
  const pool = await viem.deployContract("ForexPool", [usdc, eurc, initialPrice, deployer]);
  console.log(`Deployed ForexPool: ${pool.address}`);

  // ---------------------------------------------------------------------------
  // Step 3: seed via addLiquidity
  // ---------------------------------------------------------------------------
  const seedUsdcRaw = process.env.SEED_USDC?.trim();
  const seedEurcRaw = process.env.SEED_EURC?.trim();
  const seedUsdc = seedUsdcRaw ? parseUnits(seedUsdcRaw, 6) : 0n;
  const seedEurc = seedEurcRaw ? parseUnits(seedEurcRaw, 6) : 0n;

  if (seedUsdc > 0n || seedEurc > 0n) {
    if (seedUsdc > 0n) {
      const h = await wallet.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [pool.address, seedUsdc],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      console.log(`Approved USDC: ${h}`);
    }
    if (seedEurc > 0n) {
      const h = await wallet.writeContract({
        address: eurc,
        abi: erc20Abi,
        functionName: "approve",
        args: [pool.address, seedEurc],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      console.log(`Approved EURC: ${h}`);
    }
    const h = await wallet.writeContract({
      address: pool.address,
      abi: poolAbi,
      functionName: "addLiquidity",
      args: [seedUsdc, seedEurc, 0n],
    });
    await publicClient.waitForTransactionReceipt({ hash: h });
    console.log(`Seeded LP: ${h}`);
  }

  const [usdcR, eurcR] = (await publicClient.readContract({
    address: pool.address,
    abi: [
      {
        inputs: [],
        name: "reserves",
        outputs: [
          { name: "usdcReserve", type: "uint256" },
          { name: "eurcReserve", type: "uint256" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
    functionName: "reserves",
  })) as [bigint, bigint];

  console.log(
    JSON.stringify(
      {
        chainId,
        deployer,
        forexPool: pool.address,
        usdc,
        eurc,
        initialPrice1e18: initialPrice.toString(),
        reserves: {
          usdc: formatUnits(usdcR, 6),
          eurc: formatUnits(eurcR, 6),
        },
        envHint: {
          NEXT_PUBLIC_ARC_FOREX_POOL: pool.address,
        },
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
