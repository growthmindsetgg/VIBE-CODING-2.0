/**
 * Paper-trade storage — localStorage, per-browser, SSR-safe.
 *
 * NOTE: Nothing here touches chain state. This is 100% fake money for
 * practice/education on the Arc testnet flow. No tokens are transferred.
 */

export type TradeSide = "buy-eur" | "sell-eur";

export type PaperTradeRecord = {
  id: string;
  at: number;
  side: TradeSide;
  /** Input amount (USDC if buy-eur, EURC if sell-eur). */
  amountIn: number;
  /** Output amount after simulated 10bps fee. */
  amountOut: number;
  /** Market rate at execution (USDC per 1 EURC). */
  rate: number;
  /** USD-equivalent net worth after the trade. */
  portfolioAfterUsd: number;
};

export type PaperTradeState = {
  balanceUsdc: number;
  balanceEurc: number;
  startingEquityUsd: number;
  trades: PaperTradeRecord[];
  priceHistory: Array<{ t: number; eurUsd: number }>;
};

export const STARTING_USDC = 10_000;
export const STARTING_EURC = 0;
export const PAPER_TRADE_FEE_BPS = 10;

const STORAGE_KEY = "vibefunds:paper-trade:v1";
const MAX_PRICE_SAMPLES = 240;
const MAX_TRADES = 200;

function freshState(): PaperTradeState {
  return {
    balanceUsdc: STARTING_USDC,
    balanceEurc: STARTING_EURC,
    startingEquityUsd: STARTING_USDC,
    trades: [],
    priceHistory: [],
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadPaperTradeState(): PaperTradeState {
  if (!isBrowser()) return freshState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw) as Partial<PaperTradeState>;
    return {
      balanceUsdc: Number.isFinite(parsed.balanceUsdc) ? (parsed.balanceUsdc as number) : STARTING_USDC,
      balanceEurc: Number.isFinite(parsed.balanceEurc) ? (parsed.balanceEurc as number) : STARTING_EURC,
      startingEquityUsd: Number.isFinite(parsed.startingEquityUsd)
        ? (parsed.startingEquityUsd as number)
        : STARTING_USDC,
      trades: Array.isArray(parsed.trades) ? (parsed.trades as PaperTradeRecord[]) : [],
      priceHistory: Array.isArray(parsed.priceHistory)
        ? (parsed.priceHistory as PaperTradeState["priceHistory"])
        : [],
    };
  } catch {
    return freshState();
  }
}

export function savePaperTradeState(state: PaperTradeState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full / private mode — silently ignore
  }
}

export function resetPaperTradeState(): PaperTradeState {
  const next = freshState();
  savePaperTradeState(next);
  return next;
}

export function appendPrice(state: PaperTradeState, eurUsd: number): PaperTradeState {
  const history = [...state.priceHistory, { t: Date.now(), eurUsd }];
  while (history.length > MAX_PRICE_SAMPLES) history.shift();
  return { ...state, priceHistory: history };
}

/**
 * Execute a paper trade at the given market rate.
 * Rate is USDC per 1 EURC (e.g. 1.08 means 1 EURC costs 1.08 USDC).
 * Applies a flat PAPER_TRADE_FEE_BPS haircut on output to simulate real-world slippage + fee.
 */
export function executePaperTrade(
  state: PaperTradeState,
  params: { side: TradeSide; amountIn: number; usdcPerEurc: number },
): { next: PaperTradeState; error?: string; trade?: PaperTradeRecord } {
  const { side, amountIn, usdcPerEurc } = params;
  if (!Number.isFinite(amountIn) || amountIn <= 0) {
    return { next: state, error: "Enter a positive amount." };
  }
  if (!Number.isFinite(usdcPerEurc) || usdcPerEurc <= 0) {
    return { next: state, error: "Market rate unavailable — try again in a moment." };
  }

  const feeMult = 1 - PAPER_TRADE_FEE_BPS / 10_000;
  let next = state;
  let amountOut = 0;

  if (side === "buy-eur") {
    if (amountIn > state.balanceUsdc) {
      return { next: state, error: "Insufficient paper USDC." };
    }
    amountOut = (amountIn / usdcPerEurc) * feeMult;
    next = {
      ...state,
      balanceUsdc: state.balanceUsdc - amountIn,
      balanceEurc: state.balanceEurc + amountOut,
    };
  } else {
    if (amountIn > state.balanceEurc) {
      return { next: state, error: "Insufficient paper EURC." };
    }
    amountOut = amountIn * usdcPerEurc * feeMult;
    next = {
      ...state,
      balanceEurc: state.balanceEurc - amountIn,
      balanceUsdc: state.balanceUsdc + amountOut,
    };
  }

  const portfolioAfterUsd = next.balanceUsdc + next.balanceEurc * usdcPerEurc;

  const trade: PaperTradeRecord = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    at: Date.now(),
    side,
    amountIn,
    amountOut,
    rate: usdcPerEurc,
    portfolioAfterUsd,
  };

  const trades = [trade, ...next.trades].slice(0, MAX_TRADES);
  next = { ...next, trades };
  return { next, trade };
}

export function portfolioUsd(state: PaperTradeState, usdcPerEurc: number): number {
  if (!Number.isFinite(usdcPerEurc) || usdcPerEurc <= 0) return state.balanceUsdc;
  return state.balanceUsdc + state.balanceEurc * usdcPerEurc;
}

export function pnl(state: PaperTradeState, usdcPerEurc: number): { absUsd: number; pct: number } {
  const eq = portfolioUsd(state, usdcPerEurc);
  const abs = eq - state.startingEquityUsd;
  const pct = state.startingEquityUsd > 0 ? (abs / state.startingEquityUsd) * 100 : 0;
  return { absUsd: abs, pct };
}
