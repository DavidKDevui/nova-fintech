import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/providers/toast-provider";
import "./globals.css";

// DM Sans — police d'interface (charte ActiDec v3) — version Google officielle, bien hintée
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
// JetBrains Mono — tout ce qui est chiffré : montants, dates, identifiants (charte ActiDec v3)
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Actidec",
  description: "Trésorerie pour professionnels de santé",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${jetbrainsMono.variable} h-full`}>
      <body className="min-h-full bg-[#FCFBFE] font-[family-name:var(--font-dm-sans)] text-ardoise-900">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
