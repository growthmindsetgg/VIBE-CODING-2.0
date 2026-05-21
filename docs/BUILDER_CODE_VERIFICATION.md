# Base Builder Code — Post-Deploy Verification

VibeFunds attribution code: `bc_beg0pkcm` (from `NEXT_PUBLIC_BASE_BUILDER_CODE`).

ERC-8021 suffix is wired through two paths in the codebase:
- **Config-level**: `dataSuffix` on `createConfig` in `lib/wagmi.ts` (matches the official Base recipe; effective for any future wagmi version that propagates it to connector writes).
- **Per-call**: `lib/base/builder-code.ts` exports `useBuilderAwareWriteContract` and `BASE_BUILDER_DATA_SUFFIX`. Used by every write contract call and by the 0x aggregator path in `app/(app)/swap/page.tsx`. This is the path that actually carries the suffix on-chain in wagmi 2.x.

Per viem's source (`sendTransaction.ts:174`), if a per-call `dataSuffix` is set, it overrides the client-level value — they are not concatenated. No double-append risk.

## After every production deploy

1. Push `main`, wait for Vercel to finish deploying `vibe-coding-2-0`.

2. On the live site (https://www.vibefunds.app), connect a wallet on **Base mainnet** and run one small real tx — e.g. deposit ~$1 USDC into the yield vault.

3. Copy the tx hash. Paste it into https://builder-code-checker.vercel.app/ and click **Check Attribution**. Expect to see `bc_beg0pkcm` parsed out.

4. Cross-check on Basescan:
   - Open the tx on https://basescan.org
   - Click **Click to see More** → **Input Data** → switch view to **Original**
   - The hex should end with `…0b0080218021802180218021802180218021` (length byte `0b` + schema id `00` + 16-byte marker `8021×8`). The bytes preceding `0b` decode to ASCII `bc_beg0pkcm`.

5. **base.dev dashboard** (https://base.dev → Settings → Builder Code): attribution counts can take up to 24h to surface. If the builder-code-checker passes and the Basescan input data shows the marker, attribution is correct — wait for the dashboard to catch up.

## If attribution fails

- **builder-code-checker returns "no attribution"**: the suffix is not landing on-chain. Re-deploy and verify `NEXT_PUBLIC_BASE_BUILDER_CODE` is set in Vercel project settings (Production env). Confirm `useBuilderAwareWriteContract` is the hook in use at the call site (not a stale `useWriteContract` import).
- **Basescan input data does NOT end with `…0080218021…`**: env var is unset in prod, or the call site bypassed the hook. Check browser DevTools → `console` for `[builder-code] NEXT_PUBLIC_BASE_BUILDER_CODE is not set` warning.
- **base.dev shows 0 after 24h but checker + Basescan both pass**: contact Base support; the bytes are right on-chain, the dashboard is the only thing missing.

## Vercel env var hygiene

Required:
```
NEXT_PUBLIC_BASE_BUILDER_CODE=bc_beg0pkcm
```

Must NOT be set (legacy from earlier attempt):
```
NEXT_PUBLIC_BASE_BUILDER_CODE_SUFFIX   ← delete from Production, Preview, Development
```

Confirm the code value via base.dev → Settings → Builder Code. Right-click the input field, Inspect, copy the DOM `value` attribute (not the visible label, which may be clipped).
