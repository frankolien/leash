import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans, Inter } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({ variable: "--font-sans", subsets: ["latin"], axes: ["wdth"] });
const app = Inter({ variable: "--font-app", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Leash", template: "%s · Leash" },
  description: "Your agent can pay now, only what you allow. Daily caps, approvals and a key you can revoke, enforced on NEAR.",
  icons: { icon: "/mark.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f6f3" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${app.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
