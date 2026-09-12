import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { PresenceHeartbeat } from "@/components/presence";
import { Toaster } from "sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "42·social — campus network for 42 students",
  description:
    "Minimal social network for 42 / 1337 students. Sign in with Google or 42 Intra.",
  applicationName: "42·social",
  appleWebApp: { capable: true, title: "42·social", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#09090B",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-full bg-zinc-50 font-sans text-zinc-900 antialiased dark:bg-black dark:text-zinc-50`}
      >
        <ThemeProvider>
          <PresenceHeartbeat />
          <Navbar />
          <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-12 pt-5">
            {children}
          </main>
          <Footer />
          <Toaster position="bottom-center" richColors={false} />
        </ThemeProvider>
      </body>
    </html>
  );
}
