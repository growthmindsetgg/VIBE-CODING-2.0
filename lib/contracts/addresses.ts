export function usdcAddress(): `0x${string}` | undefined {
  const raw = process.env.NEXT_PUBLIC_USDC_ADDRESS;
  if (!raw || !raw.startsWith("0x") || raw.length !== 42) return undefined;
  return raw as `0x${string}`;
}

export function protocolTreasury(): `0x${string}` | undefined {
  const raw = process.env.NEXT_PUBLIC_PROTOCOL_TREASURY;
  if (!raw || !raw.startsWith("0x") || raw.length !== 42) return undefined;
  return raw as `0x${string}`;
}
