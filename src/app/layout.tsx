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
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231e4c7e'/%3E%3Cpath d='M6 20 16 9l10 11' stroke='%23fff' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M12 20v4M20 20v4' stroke='%23fff' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E",
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
