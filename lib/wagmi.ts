import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";

import { arcTestnet, baseMainnet, monadMainnet } from "@/lib/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  console.warn(
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. WalletConnect (mobile wallets) may not work until you add it from https://cloud.walletconnect.com",
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: "VibeFunds",
  projectId: projectId ?? "00000000000000000000000000000000",
  chains: [arcTestnet, baseMainnet, monadMainnet],
  ssr: true,
  transports: {
    [arcTestnet.id]: http(
      process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || arcTestnet.rpcUrls.default.http[0],
    ),
    [baseMainnet.id]: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() || baseMainnet.rpcUrls.default.http[0],
    ),
    [monadMainnet.id]: http(
      process.env.NEXT_PUBLIC_MONAD_RPC_URL?.trim() || monadMainnet.rpcUrls.default.http[0],
    ),
  },
});
