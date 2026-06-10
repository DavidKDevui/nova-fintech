import type { Metadata } from "next";
import { DM_Sans, Sora } from "next/font/google";
import { ToastProvider } from "@/providers/toast-provider";
import "./globals.css";

// DM Sans — police d'interface (charte ActiDec v3) — version Google officielle, bien hintée
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
// Sora — tout ce qui est chiffré : montants, dates, identifiants (charte ActiDec v3).
// Sans-serif géométrique (PAS monospace → chiffres non alignés en colonnes). Police variable.
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
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
    <html lang="fr" className={`${dmSans.variable} ${sora.variable} h-full`}>
      <body className="min-h-full bg-[#FCFBFE] font-[family-name:var(--font-dm-sans)] text-ardoise-900">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
