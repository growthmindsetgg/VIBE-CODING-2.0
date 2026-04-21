"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Timer, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceSparkline } from "@/components/paper-trade/price-sparkline";
import { usePaperTradePrice } from "@/components/paper-trade/use-paper-trade-price";
import {
  PAPER_TRADE_FEE_BPS,
  STARTING_USDC,
  appendPrice,
  executePaperTrade,
  loadPaperTradeState,
  pnl,
  portfolioUsd,
  resetPaperTradeState,
  savePaperTradeState,
  type PaperTradeState,
  type TradeSide,
} from "@/lib/paper-trade/storage";

function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function PaperTradePage() {
  const { price, isLoading, error, countdown, refresh } = usePaperTradePrice();
  const [state, setState] = useState<PaperTradeState | null>(null);
  const [side, setSide] = useState<TradeSide>("buy-eur");
  const [amount, setAmount] = useState("100");

  useEffect(() => {
    setState(loadPaperTradeState());
  }, []);

  useEffect(() => {
    if (!state || !price) return;
    const last = state.priceHistory.at(-1);
    if (last && Math.abs(last.eurUsd - price.usdPerEurc) < 1e-6) return;
    const next = appendPrice(state, price.usdPerEurc);
    setState(next);
    savePaperTradeState(next);
  }, [price, state]);

  const rate = price?.usdcPerEurc ?? 0;
  const usdEurSpot = price?.usdPerEurc ?? 0;

  const equityUsd = useMemo(() => (state && rate ? portfolioUsd(state, rate) : 0), [state, rate]);
  const pnlData = useMemo(() => (state && rate ? pnl(state, rate) : { absUsd: 0, pct: 0 }), [state, rate]);

  const handleTrade = useCallback(() => {
    if (!state) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    const { next, error: tradeErr, trade } = executePaperTrade(state, {
      side,
      amountIn: n,
      usdcPerEurc: rate,
    });
    if (tradeErr || !trade) {
      toast.error(tradeErr ?? "Trade failed");
      return;
    }
    setState(next);
    savePaperTradeState(next);
    toast.success(
      side === "buy-eur"
        ? `Bought ${fmtNum(trade.amountOut, 4)} EURC for ${fmtNum(trade.amountIn, 2)} USDC`
        : `Sold ${fmtNum(trade.amountIn, 4)} EURC for ${fmtNum(trade.amountOut, 2)} USDC`,
    );
  }, [state, amount, side, rate]);

  const handleReset = useCallback(() => {
    const next = resetPaperTradeState();
    setState(next);
    toast.success("Paper balance reset to 10,000 USDC");
  }, []);

  const canTrade = state !== null && rate > 0 && Number(amount) > 0;

  const maxInput = useMemo(() => {
    if (!state) return 0;
    return side === "buy-eur" ? state.balanceUsdc : state.balanceEurc;
  }, [state, side]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold uppercase tracking-tight">
          Paper Trade
        </h1>
        <p className="max-w-2xl font-mono text-sm text-zinc-700">
          Practice USDC ↔ EURC with live market prices and fake money. Zero on-chain risk. Perfect
          sandbox before you commit real funds to the Arc / Base / Monad swap page.
        </p>
      </div>

      {/* Live-price banner */}
      <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">Live EUR/USD</p>
            <p className="font-mono text-2xl font-bold text-zinc-900">
              {usdEurSpot ? `$${fmtNum(usdEurSpot, 4)}` : "—"}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">1 USDC buys</p>
            <p className="font-mono text-2xl font-bold text-zinc-900">
              {rate ? `${fmtNum(1 / rate, 4)} EURC` : "—"}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">1 EURC buys</p>
            <p className="font-mono text-2xl font-bold text-zinc-900">
              {rate ? `${fmtNum(rate, 4)} USDC` : "—"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1 rounded-md border-2 border-black bg-[#eef2ff] px-2 py-0.5 font-mono text-[11px] font-bold">
              <Timer className="size-3" /> refresh in {countdown}s
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={isLoading}
            >
              <RefreshCcw className="mr-1 size-3" />
              {isLoading ? "…" : "Refresh"}
            </Button>
          </div>
        </CardContent>
        {error ? (
          <p className="border-t-2 border-red-500 bg-red-50 px-4 py-2 font-mono text-[11px] text-red-700">
            Price fetch issue: {error}. Showing last cached rate.
          </p>
        ) : null}
      </Card>

      <PriceSparkline points={state?.priceHistory ?? []} />

      <div className="grid gap-5 md:grid-cols-2">
        {/* Trade form */}
        <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
          <CardHeader className="border-b-[3px] border-black bg-gradient-to-br from-[#eef2ff] to-[#dbeafe]">
            <CardTitle className="font-[family-name:var(--font-display)] text-xl uppercase tracking-tight">
              Trade
            </CardTitle>
            <CardDescription className="font-mono text-xs text-zinc-600">
              Simulated fee: {PAPER_TRADE_FEE_BPS} bps (mimics real swap costs).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="flex gap-2">
              {(["buy-eur", "sell-eur"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={`flex-1 rounded-md border-[3px] border-black px-3 py-1.5 font-mono text-xs font-bold uppercase transition-colors ${
                    side === s
                      ? "bg-black text-white shadow-[3px_3px_0_0_#9146FF]"
                      : "bg-white hover:bg-[#eef2ff]"
                  }`}
                >
                  {s === "buy-eur" ? "USDC → EURC" : "EURC → USDC"}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="font-mono text-xs text-zinc-700">
                  {side === "buy-eur" ? "Spend USDC" : "Sell EURC"}
                </Label>
                <button
                  type="button"
                  onClick={() => setAmount(String(maxInput))}
                  className="rounded border-2 border-black bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase hover:bg-[#eef2ff]"
                >
                  Max
                </button>
              </div>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-mono"
              />
              <p className="font-mono text-[11px] text-zinc-600">
                You receive ≈{" "}
                {rate && Number(amount) > 0
                  ? side === "buy-eur"
                    ? `${fmtNum((Number(amount) / rate) * (1 - PAPER_TRADE_FEE_BPS / 10_000), 4)} EURC`
                    : `${fmtNum(Number(amount) * rate * (1 - PAPER_TRADE_FEE_BPS / 10_000), 2)} USDC`
                  : "—"}
              </p>
            </div>

            <Button type="button" onClick={handleTrade} disabled={!canTrade} className="w-full">
              {side === "buy-eur" ? "Buy EURC" : "Sell EURC"}
            </Button>
          </CardContent>
        </Card>

        {/* Portfolio */}
        <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
          <CardHeader className="border-b-[3px] border-black bg-gradient-to-br from-[#eef2ff] to-[#dbeafe]">
            <div className="flex items-center justify-between">
              <CardTitle className="font-[family-name:var(--font-display)] text-xl uppercase tracking-tight">
                Portfolio
              </CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={handleReset}>
                Reset
              </Button>
            </div>
            <CardDescription className="font-mono text-xs text-zinc-600">
              Start: {fmtNum(STARTING_USDC, 0)} USDC. Live PnL at current market rate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="USDC" value={state ? fmtNum(state.balanceUsdc, 2) : "—"} />
              <Stat label="EURC" value={state ? fmtNum(state.balanceEurc, 4) : "—"} />
              <Stat label="Equity (USD)" value={`$${fmtNum(equityUsd, 2)}`} />
              <div
                className={`rounded-md border-2 p-2.5 ${
                  pnlData.absUsd >= 0
                    ? "border-emerald-600 bg-emerald-50"
                    : "border-red-600 bg-red-50"
                }`}
              >
                <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">PnL</p>
                <p
                  className={`mt-0.5 flex items-center gap-1 font-mono text-sm font-bold ${
                    pnlData.absUsd >= 0 ? "text-emerald-800" : "text-red-800"
                  }`}
                >
                  {pnlData.absUsd >= 0 ? (
                    <TrendingUp className="size-3.5" />
                  ) : (
                    <TrendingDown className="size-3.5" />
                  )}
                  {pnlData.absUsd >= 0 ? "+" : ""}${fmtNum(pnlData.absUsd, 2)} ({fmtNum(pnlData.pct, 2)}%)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trade history */}
      <Card className="border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]">
        <CardHeader className="border-b-[3px] border-black bg-gradient-to-br from-[#eef2ff] to-[#dbeafe]">
          <CardTitle className="font-[family-name:var(--font-display)] text-xl uppercase tracking-tight">
            Trade History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!state || state.trades.length === 0 ? (
            <p className="p-5 font-mono text-[11px] text-zinc-500">No trades yet. Make your first paper trade.</p>
          ) : (
            <div className="max-h-[320px] overflow-auto">
              <table className="w-full font-mono text-xs">
                <thead className="sticky top-0 border-b-2 border-black bg-[#eef2ff] text-left">
                  <tr>
                    <th className="p-2">Time</th>
                    <th className="p-2">Side</th>
                    <th className="p-2">In</th>
                    <th className="p-2">Out</th>
                    <th className="p-2">Rate</th>
                    <th className="p-2">Equity after</th>
                  </tr>
                </thead>
                <tbody>
                  {state.trades.map((t) => (
                    <tr key={t.id} className="border-b border-black/10 hover:bg-[#f8f7ff]">
                      <td className="p-2">{new Date(t.at).toLocaleTimeString()}</td>
                      <td className="p-2 font-bold">
                        {t.side === "buy-eur" ? "USDC→EURC" : "EURC→USDC"}
                      </td>
                      <td className="p-2">
                        {fmtNum(t.amountIn, t.side === "buy-eur" ? 2 : 4)}{" "}
                        {t.side === "buy-eur" ? "USDC" : "EURC"}
                      </td>
                      <td className="p-2">
                        {fmtNum(t.amountOut, t.side === "buy-eur" ? 4 : 2)}{" "}
                        {t.side === "buy-eur" ? "EURC" : "USDC"}
                      </td>
                      <td className="p-2">{fmtNum(t.rate, 4)}</td>
                      <td className="p-2">${fmtNum(t.portfolioAfterUsd, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disclosure */}
      <div className="rounded-xl border-[3px] border-black bg-[#0a0a12] p-5 font-mono text-[11px] text-cyan-100 shadow-[5px_5px_0_0_#5c16c5]">
        <p className="mb-2 font-bold uppercase tracking-wide text-cyan-300">Honest disclosure</p>
        <ul className="list-inside list-disc space-y-1 text-cyan-100/90">
          <li>
            This is 100% simulated. No tokens move on-chain. Balances live in your browser only.
          </li>
          <li>
            Price source: CoinGecko public API (cached 30s server-side). Refreshes every 20 seconds.
          </li>
          <li>
            The {PAPER_TRADE_FEE_BPS}-bps simulated fee approximates real DEX costs on Arc / Base /
            Monad. Real swap costs can be higher for small trade sizes and during volatility.
          </li>
          <li>
            PnL here does <b>not</b> predict real trading results. Consistent profit from scalping
            USDC↔EURC on-chain is extremely rare — fees usually eat the forex edge.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border-2 border-black bg-[#f8f7ff] p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 break-all font-mono text-sm font-bold text-zinc-900">{value}</p>
    </div>
  );
}
