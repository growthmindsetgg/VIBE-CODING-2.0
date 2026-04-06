import { redirect } from "next/navigation";

/** Old path — always send users to the real swap page. */
export default function StableSwapRedirectPage() {
  redirect("/swap");
}
