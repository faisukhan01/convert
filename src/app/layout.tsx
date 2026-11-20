import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "RidgeLine — Estimate desk for roofing teams",
  description:
    "Multi-tenant booking and follow-up desk for roofing contractors: inquiries to inspections, estimates to matched payments. GHL-ready, runs locally with zero credentials.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%233b6aa8'/%3E%3Cstop offset='1' stop-color='%23234d84'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='8.5' fill='url(%23g)'/%3E%3Cpath d='M6.5 21.5 13.5 11.5l4.6 5.4 7.4-8.9' stroke='%23fff' stroke-width='2.7' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='25.5' cy='8' r='2.05' fill='%23fff'/%3E%3C/svg%3E",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="antialiased bg-background text-foreground" style={{ fontFamily: "var(--font-inter), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
