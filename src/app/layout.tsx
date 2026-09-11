import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { MobileTabBar } from "@/components/MobileTabBar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Manza Costing",
  description: "Internal costing engine",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full font-sans">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1 bg-canvas pb-20 md:pb-0">
            <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
              {children}
            </div>
          </main>
          <MobileTabBar />
        </div>
      </body>
    </html>
  );
}
