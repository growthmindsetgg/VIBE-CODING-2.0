import { defineChain } from "viem";

/** Monad mainnet — https://docs.monad.xyz */
export const monadMainnet = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "MonadScan",
      url: "https://monadscan.com",
    },
  },
});
