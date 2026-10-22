import type { Metadata } from "next";
import { Silkscreen, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Silkscreen({ weight: ["400", "700"], subsets: ["latin"], variable: "--display" });
const mono = IBM_Plex_Mono({ weight: ["400", "600"], subsets: ["latin"], variable: "--mono" });

export const metadata: Metadata = {
  title: "README vs Reality",
  description: "Paste a GitHub repo. A crew of agents reads it, builds it, runs it and scores it out of 100.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
