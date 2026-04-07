import { isAddress } from "viem";

/**
 * When set, only this connected wallet may see the Pool “paste addresses” setup UI.
 * Everyone else uses `NEXT_PUBLIC_*` env vars baked into the deployment (Vercel, etc.).
 * When unset, the setup form stays visible to all wallets (local/dev convenience).
 */
export function poolConfigDeployerAddress(): `0x${string}` | undefined {
  const raw = process.env.NEXT_PUBLIC_POOL_DEPLOYER_ADDRESS?.trim();
  if (!raw || !isAddress(raw)) return undefined;
  if (raw.toLowerCase() === "0x0000000000000000000000000000000000000000") return undefined;
  return raw as `0x${string}`;
}

export function isPoolConfigDeployer(connected: `0x${string}` | undefined): boolean {
  const d = poolConfigDeployerAddress();
  if (!d || !connected) return false;
  return d.toLowerCase() === connected.toLowerCase();
}
