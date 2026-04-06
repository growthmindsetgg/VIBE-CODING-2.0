import Link from "next/link";

export default function LitepaperPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-zinc-900">
      <header className="border-b-[3px] border-black bg-black px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-lg font-bold text-white hover:text-[#a970ff]"
          >
            ← VibeFunds
          </Link>
          <a
            href="https://github.com/growthmindsetgg/vibefund"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold uppercase tracking-wide text-white/90 hover:text-white"
          >
            GitHub
          </a>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#5c16c5]">Litepaper</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold uppercase text-black">
          VibeFunds MVP
        </h1>
        <p className="mt-4 text-lg text-zinc-600">
          A short product and protocol outline for the hackathon-style build: gamified mutual-fund cards,
          local simulation, and Arc testnet execution.
        </p>

        <section className="mt-12 space-y-4 border-[3px] border-black bg-white p-6 shadow-[4px_4px_0_0_#000]">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold uppercase">Problem</h2>
          <p className="text-sm leading-relaxed text-zinc-700">
            On-chain fund primitives are powerful but opaque. VibeFunds makes a fund legible as a
            product: named vaults, agent personalities, a training loop, and a marketplace view — before
            and alongside real subscribe / deposit flows.
          </p>
        </section>

        <section className="mt-6 space-y-4 border-[3px] border-black bg-[#eef2ff] p-6 shadow-[4px_4px_0_0_#000]">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold uppercase">Architecture</h2>
          <ul className="list-inside list-disc space-y-2 text-sm text-zinc-700">
            <li>
              <strong className="text-black">Next.js 15</strong> app router for marketing + dashboard.
            </li>
            <li>
              <strong className="text-black">Hardhat</strong> contracts: hybrid share token + FundManager
              (USDC vault, subscribe, owner ops).
            </li>
            <li>
              <strong className="text-black">wagmi + viem + RainbowKit</strong> on Arc testnet (chain
              5042002).
            </li>
            <li>
              Optional <strong className="text-black">Supabase</strong> sync for fund metadata when env is
              configured.
            </li>
          </ul>
        </section>

        <section className="mt-6 space-y-4 border-[3px] border-black bg-white p-6 shadow-[4px_4px_0_0_#000]">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold uppercase">Flows</h2>
          <ol className="list-inside list-decimal space-y-3 text-sm text-zinc-700">
            <li>Create a fund (name, personality, optional deployed addresses).</li>
            <li>Link share token, NFT mirror, and FundManager from deploy output.</li>
            <li>Train the agent locally for XP; leaderboard is browser-local.</li>
            <li>Subscribe with USDC when FundManager reports share token configured.</li>
          </ol>
        </section>

        <section className="mt-6 space-y-4 border-[3px] border-black bg-[#fafaf8] p-6 shadow-[4px_4px_0_0_#000]">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold uppercase">Risks</h2>
          <p className="text-sm leading-relaxed text-zinc-700">
            Testnet only; NAV simulation is not investment advice. Smart contracts are unaudited
            prototypes — do not use with real funds.
          </p>
        </section>

        <p className="mt-10">
          <Link
            href="/marketplace"
            className="inline-flex border-[3px] border-black bg-[#9146ff] px-6 py-3 text-sm font-bold uppercase text-white shadow-[4px_4px_0_0_#000]"
          >
            Launch app →
          </Link>
        </p>
      </article>
    </div>
  );
}
