import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/components/providers/web3-provider";
import { VibeFundsProvider } from "@/components/providers/vibe-funds-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "VibeFunds — AI agent mutual funds on Arc",
  description:
    "Gamified mutual funds powered by on-chain agents. Create funds, train agents, trade hybrid ERC-404-style shares on Arc testnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${display.variable} min-h-screen antialiased`}
      >
        <Web3Provider>
          <VibeFundsProvider>{children}</VibeFundsProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
