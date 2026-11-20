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
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2331719F'/%3E%3Cstop offset='1' stop-color='%2316354E'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='40' height='40' rx='11' fill='url(%23g)'/%3E%3Cpath d='M7.5 28.5 15.5 14l6 7.6 3.7-4.6 7.3 11.5Z' fill='%23fff'/%3E%3C/svg%3E",
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
