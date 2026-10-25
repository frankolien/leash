import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Montserrat } from "next/font/google";
import "./globals.css";

const display = Montserrat({ variable: "--font-display", subsets: ["latin"], weight: ["500", "800", "900"] });
const body = Inter({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Leash", template: "%s · Leash" },
  description: "Give your AI agents a budget, not your wallet. Daily caps, approvals and a kill switch, enforced on NEAR.",
  icons: { icon: "/mark.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#17191d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
