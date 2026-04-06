import Link from "next/link";
import { ArrowRight } from "lucide-react";

const GITHUB_URL = "https://github.com/growthmindsetgg/vibefund";

const ticker =
  "HYBRID SHARES + TRAIN AGENTS + SUBSCRIBE WITH USDC + ARC TESTNET + ERC-404-STYLE UNITS + OPEN MARKETPLACE";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f0] text-zinc-900">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-[3px] border-black bg-black px-4 py-4 sm:px-8">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-white sm:text-2xl"
        >
          VIBEFUNDS
        </Link>
        <nav className="flex flex-wrap items-center gap-2 sm:gap-4">
          <a
            href="#how-it-works"
            className="text-xs font-bold uppercase tracking-wide text-white/90 hover:text-white sm:text-sm"
          >
            How it works
          </a>
          <Link
            href="/litepaper"
            className="text-xs font-bold uppercase tracking-wide text-white/90 hover:text-white sm:text-sm"
          >
            Litepaper
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold uppercase tracking-wide text-white/90 hover:text-white sm:text-sm"
          >
            GitHub
          </a>
          <Link
            href="/swap"
            className="text-xs font-bold uppercase tracking-wide text-[#a970ff] hover:text-white sm:text-sm"
          >
            Swap
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 border-[3px] border-black bg-[#1f69ff] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-[4px_4px_0_0_#000] transition-transform hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] sm:text-sm"
          >
            Launch app
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </nav>
      </header>

      <div className="grid flex-1 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col justify-center border-b-[3px] border-black px-4 py-12 sm:px-10 sm:py-16 lg:border-b-0 lg:border-r-[3px] lg:border-black">
          <span className="inline-flex w-fit items-center border-[3px] border-black bg-[#a970ff] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-black shadow-[3px_3px_0_0_#000] sm:text-xs">
            Agent funds on Arc
          </span>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-bold uppercase leading-[0.95] tracking-tight text-black sm:text-5xl lg:text-6xl">
            Say hello to VibeFunds
          </h1>
          <p className="mt-4 max-w-lg text-lg font-semibold text-zinc-800 sm:text-xl">
            Create funds, train agents, trade hybrid share units — all wired for Arc testnet.
          </p>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-base">
            Pair USDC vaults with fungible + NFT-mirrored shares. Browse the marketplace, link deployed
            contracts from Hardhat, and subscribe on-chain when your FundManager is ready.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center gap-2 border-[3px] border-black bg-[#9146ff] px-8 py-4 text-center text-sm font-bold uppercase tracking-wide text-white shadow-[6px_6px_0_0_#000] transition-transform hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[5px_5px_0_0_#000]"
            >
              Launch app
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center border-[3px] border-black bg-[#fafaf8] px-8 py-4 text-sm font-bold uppercase tracking-wide text-black shadow-[6px_6px_0_0_#000] transition-transform hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[5px_5px_0_0_#000]"
            >
              How it works
            </a>
            <Link
              href="/swap"
              className="inline-flex items-center justify-center border-[3px] border-black bg-[#1f69ff] px-8 py-4 text-sm font-bold uppercase tracking-wide text-white shadow-[6px_6px_0_0_#000] transition-transform hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[5px_5px_0_0_#000]"
            >
              Swap USDC / EURC
              <ArrowRight className="ml-2 size-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap gap-2">
            {["Arc testnet", "USDC flows", "ERC-404-style", "RainbowKit"].map((t) => (
              <span
                key={t}
                className="border-[2px] border-black bg-black px-2 py-1 font-mono text-[10px] font-bold uppercase text-white sm:text-xs"
              >
                {t}
              </span>
            ))}
            <span className="border-[2px] border-black bg-white px-2 py-1 font-mono text-[10px] font-bold uppercase text-black sm:text-xs">
              Open source
            </span>
          </div>
        </section>

        <section className="relative flex items-center justify-center bg-[#e8ecff] px-4 py-12 sm:py-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative z-[1] w-full max-w-md space-y-3">
            <div className="border-[3px] border-black bg-[#a970ff] p-4 shadow-[6px_6px_0_0_#000]">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-black/80">
                {"// Active fund"}
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold text-black">
                Neon Lattice Growth
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-black">$1,000 USDC target</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="border-[3px] border-black bg-[#c4b5fd] p-3 text-center shadow-[4px_4px_0_0_#000]">
                <p className="font-mono text-xs font-bold text-black">You</p>
                <p className="mt-1 font-mono text-sm font-bold text-zinc-800">Subscribed</p>
              </div>
              <div className="border-[3px] border-black bg-[#c4b5fd] p-3 text-center shadow-[4px_4px_0_0_#000]">
                <p className="font-mono text-xs font-bold text-black">Vault</p>
                <p className="mt-1 font-mono text-sm font-bold text-zinc-800">USDC</p>
              </div>
              <div className="flex flex-col items-center justify-center border-[3px] border-black bg-black p-3 text-center shadow-[4px_4px_0_0_#000]">
                <span className="text-lg text-white" aria-hidden>
                  ⧉
                </span>
                <p className="mt-1 font-mono text-[10px] font-bold uppercase text-white">NFT mirror</p>
              </div>
            </div>
            <div className="border-[3px] border-black bg-[#fafaf8] p-3 shadow-[4px_4px_0_0_#000]">
              <p className="font-mono text-xs font-bold text-emerald-800">✓ Ready to trade</p>
              <p className="mt-1 text-sm text-zinc-600">
                Connect on Arc · approve USDC · subscribe for share wei + whole NFT units.
              </p>
            </div>
          </div>
        </section>
      </div>

      <section
        id="how-it-works"
        className="border-t-[3px] border-black bg-white px-4 py-16 sm:px-10"
      >
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase text-black sm:text-4xl">
          How it works
        </h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Create & link",
              body: "Spin up a fund card, pick an agent personality, and paste share token, NFT, and FundManager addresses from your deploy.",
            },
            {
              step: "02",
              title: "Train & browse",
              body: "Run the local prediction loop for XP, then explore the marketplace for NAV sims and open any fund cockpit.",
            },
            {
              step: "03",
              title: "Subscribe on-chain",
              body: "On Arc, approve USDC and call subscribe on your linked manager — shares and NFT mirrors follow your contract rules.",
            },
          ].map((item) => (
            <li
              key={item.step}
              className="border-[3px] border-black bg-[#eef2ff] p-6 shadow-[4px_4px_0_0_#000]"
            >
              <span className="font-mono text-sm font-bold text-[#9146ff]">{item.step}</span>
              <h3 className="mt-2 font-[family-name:var(--font-display)] text-lg font-bold text-black">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/litepaper"
            className="text-sm font-bold uppercase tracking-wide text-[#5c16c5] underline underline-offset-4"
          >
            Read the litepaper →
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold uppercase tracking-wide text-[#5c16c5] underline underline-offset-4"
          >
            View on GitHub →
          </a>
        </div>
      </section>

      <div className="overflow-hidden border-t-[3px] border-black bg-[#1f69ff] py-3">
        <div className="flex w-max animate-[vf-marquee_32s_linear_infinite] font-mono text-xs font-bold uppercase tracking-widest text-white sm:text-sm">
          <span className="px-6">{ticker}</span>
          <span className="px-6" aria-hidden>
            {ticker}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes vf-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
