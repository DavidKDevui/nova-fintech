import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Sora } from "next/font/google";
import { ToastProvider } from "@/providers/toast-provider";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"] });

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
