import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Arena",
  description:
    "Author a game environment, verify it, play it, and keep the trajectory data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ArenaTools />
        <div className="shell">
          <nav className="site-nav">
            <a className="wordmark" href="/">
              Arena
            </a>
            <span className="muted">Environments you can train against</span>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
