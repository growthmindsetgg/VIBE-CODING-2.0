import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/components/providers/web3-provider";
import { VibeFundsProvider } from "@/components/providers/vibe-funds-provider";
import { SiteHeader } from "@/components/layout/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
        <Web3Provider>
          <VibeFundsProvider>
            <SiteHeader />
            {children}
          </VibeFundsProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
