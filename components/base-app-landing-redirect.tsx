"use client";

// Base App / Coinbase Wallet webview redirect:
// when a user opens "/" inside the Base App's (or Coinbase Wallet app's)
// in-app browser, send them to /swap on first entry. Subsequent visits
// within the same session show the landing page normally.
//
// === Detection: isCoinbaseWallet === true AND mobile UA ===
// The canonical SDK-level signal is `window.ethereum.isCoinbaseWallet`,
// set by CoinbaseWalletProvider — see
// node_modules/@coinbase/wallet-sdk/dist/CoinbaseWalletProvider.d.ts:13
// (`readonly isCoinbaseWallet = true`).
//
// We combine it with a mobile UA check because the same flag is also
// injected by the desktop Coinbase Wallet browser extension; without
// the mobile filter, a desktop user with the extension installed would
// get redirected away from the marketing page on every fresh tab.
//
// Base docs (post-April-2026 spec change) treat the Base App as a
// "standard web app" and do NOT publish a dedicated detection API or
// user-agent suffix:
//   https://docs.base.org/mini-apps/troubleshooting/base-app-compatibility
//   https://docs.base.org/builderkits/minikit/existing-app-integration
//
// === sessionStorage (not localStorage) for the redirect flag ===
// Intentional: a fresh tab is a fresh intent. We want first-entry redirect
// behavior every time the user re-launches into the app from the Base App,
// not "I was redirected six months ago, never again." sessionStorage scopes
// the flag to this browsing context only.
//
// === router.replace (not push) ===
// Replace swaps "/" out of the history stack. If we used push, the back
// button on /swap would return to "/" which would immediately redirect
// forward to /swap → infinite back-button loop.
//
// === Why a separate client component (not "use client" on app/page.tsx) ===
// Inlining the effect would force the whole landing page to render on
// the client, dropping the / route from `○ Static` to `ƒ Dynamic` in the
// Next.js build output. The marketing page benefits from prerender + CDN
// caching for SEO. Extracting the 50 lines of redirect logic into a tiny
// client island keeps the rest server-rendered.
//
// === Fail-closed on sessionStorage errors ===
// In sandboxed iframes / private-mode contexts where sessionStorage throws,
// we skip the redirect entirely rather than fail-open. A degraded landing
// page is a better failure mode than a potential redirect loop in an
// environment where we cannot persist the flag.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REDIRECT_FLAG_KEY = "vf_base_app_redirected";

function isCoinbaseWalletWebview(): boolean {
  if (typeof window === "undefined") return false;
  const eth = (window as Window & { ethereum?: { isCoinbaseWallet?: boolean } }).ethereum;
  if (eth?.isCoinbaseWallet !== true) return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

export function BaseAppLandingRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(REDIRECT_FLAG_KEY)) return;
      if (!isCoinbaseWalletWebview()) return;
      sessionStorage.setItem(REDIRECT_FLAG_KEY, "1");
    } catch {
      return;
    }
    router.replace("/swap");
  }, [router]);
  return null;
}
