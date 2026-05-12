"use client";

import { useCallback } from "react";
import { encodeFunctionData, type Abi } from "viem";
import { useSendTransaction, useWriteContract } from "wagmi";

import { baseMainnet } from "@/lib/chains";

const ERC8021_MARKER = "0080218021802180218021802180218021";
const DEFAULT_BASE_BUILDER_CODE = "bc_beg0pkcm";

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

/**
 * Concatenates ERC-8021 builder-code bytes onto an existing calldata hex.
 * Returns the original `data` unchanged when the suffix is not active.
 */
export function appendBuilderCodeSuffix(
  chainId: number,
  data: `0x${string}` | undefined,
): `0x${string}` {
  const suffix = getBaseBuilderDataSuffix(chainId);
  const base = data && isHexData(data) ? data : "0x";
  if (!suffix) return base as `0x${string}`;
  return `${base}${suffix.slice(2)}` as `0x${string}`;
}

/**
 * Legacy wrapper kept for backwards compatibility. Adds `dataSuffix` to a
 * wagmi/viem request object on Base mainnet so libraries that respect the
 * field append it before signing. Prefer {@link useBuilderAwareWriteContract}
 * for new call sites — it pre-bakes the suffix into calldata which makes the
 * attribution robust against any wagmi/viem version that silently drops
 * unknown parameters.
 */
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

export type BuilderAwareWriteParams<TAbi extends Abi> = {
  chainId: number;
  address: `0x${string}`;
  abi: TAbi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  gas?: bigint;
};

/**
 * On Base mainnet, manually ABI-encodes the call, appends the ERC-8021
 * builder-code suffix, and dispatches via `sendTransaction`. On any other
 * chain it falls back to a normal `writeContract`. This guarantees the
 * suffix lands in the on-chain calldata regardless of wagmi/viem version,
 * connector, or wallet behaviour.
 */
export function useBuilderAwareWriteContract() {
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  return useCallback(
    async <TAbi extends Abi>(
      params: BuilderAwareWriteParams<TAbi>,
    ): Promise<`0x${string}`> => {
      const suffix = getBaseBuilderDataSuffix(params.chainId);

      if (!suffix) {
        return writeContractAsync({
          chainId: params.chainId,
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args ?? [],
          value: params.value,
          gas: params.gas,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }

      const callData = encodeFunctionData({
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const data = `${callData}${suffix.slice(2)}` as `0x${string}`;

      return sendTransactionAsync({
        chainId: params.chainId,
        to: params.address,
        data,
        value: params.value ?? BigInt(0),
        gas: params.gas,
      });
    },
    [writeContractAsync, sendTransactionAsync],
  );
}
