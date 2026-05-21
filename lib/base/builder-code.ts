"use client";

import { useCallback } from "react";
import { Attribution } from "ox/erc8021";
import type { Abi } from "viem";
import { useWriteContract } from "wagmi";

function sanitizeBuilderCode(code: string): string {
  return code.trim().replace(/[^A-Za-z0-9_-]/g, "");
}

const BUILDER_CODE = sanitizeBuilderCode(
  process.env.NEXT_PUBLIC_BASE_BUILDER_CODE ?? "",
);

if (!BUILDER_CODE && typeof window !== "undefined") {
  console.warn(
    "[builder-code] NEXT_PUBLIC_BASE_BUILDER_CODE is not set — Base attribution disabled.",
  );
}

export const BASE_BUILDER_DATA_SUFFIX: `0x${string}` | undefined = BUILDER_CODE
  ? (Attribution.toDataSuffix({ codes: [BUILDER_CODE] }) as `0x${string}`)
  : undefined;

export type BuilderAwareWriteParams<TAbi extends Abi> = {
  chainId: number;
  address: `0x${string}`;
  abi: TAbi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  gas?: bigint;
};

export function useBuilderAwareWriteContract() {
  const { writeContractAsync } = useWriteContract();

  return useCallback(
    async <TAbi extends Abi>(
      params: BuilderAwareWriteParams<TAbi>,
    ): Promise<`0x${string}`> => {
      return writeContractAsync({
        chainId: params.chainId,
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args ?? [],
        value: params.value,
        gas: params.gas,
        ...(BASE_BUILDER_DATA_SUFFIX
          ? { dataSuffix: BASE_BUILDER_DATA_SUFFIX }
          : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    },
    [writeContractAsync],
  );
}
