import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });
const display = Montserrat({ variable: "--font-display", subsets: ["latin"], weight: ["800", "900"] });

export const metadata: Metadata = {
  title: "Leash",
  description: "What your agents may spend, what is waiting on you, what they did.",
};

export const viewport: Viewport = {
  themeColor: "#131417",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
