import { baseMainnet } from "@/lib/chains";

const ERC8021_MARKER = "0080218021802180218021802180218021";
const DEFAULT_BASE_BUILDER_CODE = "bc_l4g52xrb";

function isHexData(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]+$/.test(value);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Encodes a Base Builder Code string into ERC-8021 dataSuffix bytes.
 * Format: [len:1][ascii(code)][0x00][0x8021... marker]
 */
export function encodeBuilderCodeSuffix(builderCode: string): `0x${string}` | null {
  const clean = builderCode.trim();
  if (!clean) return null;
  const bytes = new TextEncoder().encode(clean);
  if (bytes.length === 0 || bytes.length > 255) return null;
  const lenHex = bytes.length.toString(16).padStart(2, "0");
  const payload = bytesToHex(bytes);
  return `0x${lenHex}${payload}${ERC8021_MARKER}` as `0x${string}`;
}

/**
 * Returns dataSuffix for Base transactions.
 *
 * Priority:
 * 1) NEXT_PUBLIC_BASE_BUILDER_CODE_SUFFIX (already encoded hex)
 * 2) NEXT_PUBLIC_BASE_BUILDER_CODE (plain code)
 * 3) DEFAULT_BASE_BUILDER_CODE fallback
 */
export function getBaseBuilderDataSuffix(chainId: number): `0x${string}` | undefined {
  if (chainId !== baseMainnet.id) return undefined;

  const explicitSuffix = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE_SUFFIX?.trim();
  if (explicitSuffix && isHexData(explicitSuffix)) {
    return explicitSuffix;
  }

  const code =
    process.env.NEXT_PUBLIC_BASE_BUILDER_CODE?.trim() || DEFAULT_BASE_BUILDER_CODE;
  return encodeBuilderCodeSuffix(code) ?? undefined;
}

export function withBuilderDataSuffix<const T extends object>(
  chainId: number,
  request: T,
): T & { dataSuffix?: `0x${string}` } {
  const dataSuffix = getBaseBuilderDataSuffix(chainId);
  if (!dataSuffix) return request;
  return {
    ...request,
    dataSuffix,
  };
}
