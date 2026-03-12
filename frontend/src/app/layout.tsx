import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Fraunces, Space_Mono, Source_Sans_3 } from "next/font/google";

import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "600", "700"],
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Lecture Buddy",
  description: "Local lecture simplifier and flashcard generator",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const rawTheme = cookieStore.get("lecture-buddy-theme")?.value;
  const initialMode = rawTheme === "light" ? "light" : "dark";

  return (
    <html lang="en" data-theme={initialMode}>
      <body className={`${sourceSans.variable} ${fraunces.variable} ${spaceMono.variable}`}>
        <ThemeProvider initialMode={initialMode}>
          <div className="flex min-h-screen w-full flex-col md:flex-row">
            <Sidebar />
            <main className="flex-1 p-6 md:p-8">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
