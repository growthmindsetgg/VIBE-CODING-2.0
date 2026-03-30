import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "@/lib/chains/arc";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  console.warn(
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. WalletConnect (mobile wallets) may not work until you add it from https://cloud.walletconnect.com",
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: "VibeFunds",
  projectId: projectId ?? "00000000000000000000000000000000",
  chains: [arcTestnet],
  ssr: true,
});
