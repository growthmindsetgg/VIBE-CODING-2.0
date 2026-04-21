import { redirect } from "next/navigation";

/**
 * Paper Trade was retired in favor of real on-chain Forex on Arc testnet.
 * Keep this route as a permanent redirect so any old bookmarks still land.
 */
export default function PaperTradeRedirect() {
  redirect("/forex");
}
