import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { ArenaTools } from "@/components/ArenaTools";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Arena",
  description: "Describe a game. Your agent authors it. You play what it built.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ArenaTools />
        <div className="shell">
          <nav className="site-nav">
            <Link className="wordmark" href="/">
              Arena
            </Link>
            <span>A table for games you have not written yet</span>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
