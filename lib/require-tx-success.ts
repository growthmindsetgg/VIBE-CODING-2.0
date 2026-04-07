import type { TransactionReceipt } from "viem";

/** Wagmi/viem return a receipt even when the tx reverted — treat that as failure. */
export function requireTxSuccess(receipt: TransactionReceipt, message = "Transaction reverted on-chain.") {
  if (receipt.status !== "success") {
    throw new Error(message);
  }
}
