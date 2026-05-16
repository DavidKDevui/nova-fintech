import type { Metadata } from "next";
import localFont from "next/font/local";
import { ToastProvider } from "@/providers/toast-provider";
import "./globals.css";

const geist = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist",
  display: "swap",
  weight: "100 900",
});
const sora = localFont({
  src: "./fonts/Sora-Variable.woff2",
  variable: "--font-sora",
  display: "swap",
  weight: "100 800",
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
    <html lang="fr" className={`${geist.variable} ${sora.variable} h-full`}>
      <body className="min-h-full bg-[#FFFCF9] font-[family-name:var(--font-sora)] text-gray-900">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
