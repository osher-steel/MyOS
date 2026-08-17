import type { Metadata } from "next";
import { Newsreader, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Newsreader({
  variable: "--font-serif-display",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const sans = Inter({
  variable: "--font-sans-ui",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-ui",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Personal OS",
  description: "Money, news, music and events in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
