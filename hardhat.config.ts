import { config as loadEnv } from "dotenv";
import hardhatViem from "@nomicfoundation/hardhat-viem";

loadEnv();
loadEnv({ path: ".env.local", override: true });
import { configVariable, defineConfig } from "hardhat/config";

/**
 * Arc Testnet — `arc-testnet` (chainId 5042002).
 *
 * Exact reference network block (nativeCurrency is wallet metadata, not used by Hardhat RPC):
 *
 *   networks: {
 *     "arc-testnet": {
 *       url: "https://rpc.testnet.arc.network",
 *       chainId: 5042002,
 *       accounts: "remote", // or private key for `hardhat run`
 *       gasPrice: "auto",
 *       nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
 *     },
 *   }
 *
 * Implemented below: `accounts: [configVariable("DEPLOYER_PRIVATE_KEY")]` so `npm run deploy:stable-vault` works.
 */
export default defineConfig({
  plugins: [hardhatViem],
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  chainDescriptors: {
    5042002: {
      name: "Arc Testnet",
      chainType: "generic",
    },
    8453: {
      name: "Base",
      chainType: "l1",
    },
    143: {
      name: "Monad",
      chainType: "generic",
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    "arc-testnet": {
      type: "http",
      chainType: "generic",
      chainId: 5042002,
      url: "https://rpc.testnet.arc.network",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      gasPrice: "auto",
    },
    "base-mainnet": {
      type: "http",
      chainType: "l1",
      chainId: 8453,
      url: process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      gasPrice: "auto",
    },
    "monad-mainnet": {
      type: "http",
      chainType: "generic",
      chainId: 143,
      url: process.env.MONAD_RPC_URL?.trim() || "https://rpc.monad.xyz",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      gasPrice: "auto",
    },
  },
});
