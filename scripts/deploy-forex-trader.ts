import { network } from "hardhat";
import { parseUnits } from "viem";

/** Arc testnet — USDC is the gas token at 0x3600…, EURC is a test ERC-20. */
const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

/**
 * Deploy ForexTrader on Arc testnet with an initial price ~1.08 USD / EUR,
 * then (optionally) seed it with `SEED_USDC` and `SEED_EURC` from the deployer
 * wallet via ERC-20 transfer. 6-decimal amounts.
 *
 * Env:
 * - INITIAL_PRICE_1E18 — default 1080000000000000000 (1.08)
 * - SEED_USDC          — default 0 (units = whole USDC, 6 dp)
 * - SEED_EURC          — default 0
 * - FX_USDC_ADDRESS / FX_EURC_ADDRESS — overrides
 */
async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  if (!wallet?.account) {
    console.error('No local signer: set DEPLOYER_PRIVATE_KEY for arc-testnet.');
    process.exitCode = 1;
    return;
  }
  const deployer = wallet.account.address;
  const publicClient = await viem.getPublicClient();
  const chainId = Number(await publicClient.getChainId());

  const usdc = (process.env.FX_USDC_ADDRESS?.trim() || ARC_USDC) as `0x${string}`;
  const eurc = (process.env.FX_EURC_ADDRESS?.trim() || ARC_EURC) as `0x${string}`;
  const initialPrice = BigInt(process.env.INITIAL_PRICE_1E18 || "1080000000000000000");

  const trader = await viem.deployContract("ForexTrader", [usdc, eurc, initialPrice, deployer]);

  const seedUsdcRaw = process.env.SEED_USDC?.trim();
  const seedEurcRaw = process.env.SEED_EURC?.trim();
  const seedUsdc = seedUsdcRaw ? parseUnits(seedUsdcRaw, 6) : 0n;
  const seedEurc = seedEurcRaw ? parseUnits(seedEurcRaw, 6) : 0n;

  const erc20Abi = [
    {
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      name: "transfer",
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

  const seeds: Array<{ token: `0x${string}`; amount: bigint; label: string }> = [];
  if (seedUsdc > 0n) seeds.push({ token: usdc, amount: seedUsdc, label: "USDC" });
  if (seedEurc > 0n) seeds.push({ token: eurc, amount: seedEurc, label: "EURC" });

  for (const s of seeds) {
    const hash = await wallet.writeContract({
      address: s.token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [trader.address, s.amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Seeded ${s.label}: ${s.amount.toString()} (raw, 6dp) → ${trader.address}`);
  }

  const usdcReserve = await publicClient.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [trader.address],
  });
  const eurcReserve = await publicClient.readContract({
    address: eurc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [trader.address],
  });

  console.log(
    JSON.stringify(
      {
        chainId,
        deployer,
        forexTrader: trader.address,
        usdc,
        eurc,
        initialPrice1e18: initialPrice.toString(),
        reserves: { usdc: usdcReserve.toString(), eurc: eurcReserve.toString() },
        envHint: {
          NEXT_PUBLIC_ARC_FOREX_TRADER: trader.address,
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
