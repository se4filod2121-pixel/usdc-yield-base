import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@coinbase/onchainkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OnchainKit App",
  description: "Base mainnet wallet connect",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning on <html>: browser extensions (e.g. translators)
    // can rewrite lang="en" before React hydrates — suppress that diff.
    <html lang="en" suppressHydrationWarning>
      {/*
        suppressHydrationWarning on <body>: Next.js font variable class names
        are injected server-side; browser extensions or third-party scripts
        may alter attributes before hydration. Suppress body-level diffs too.
      */}
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
