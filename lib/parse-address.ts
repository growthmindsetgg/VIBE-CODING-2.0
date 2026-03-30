import { isAddress } from "viem";

export function parseOptionalAddress(value: string): `0x${string}` | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (!isAddress(v)) return undefined;
  return v as `0x${string}`;
}
