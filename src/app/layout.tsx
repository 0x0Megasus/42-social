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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: {
    default: "42·social — campus network for 42 students",
    template: "%s · 42·social",
  },
  description:
    "Minimal social network for 42 / 1337 students. Sign in with Google or 42 Intra.",
  applicationName: "42·social",
  appleWebApp: { capable: true, title: "42·social", statusBarStyle: "black" },
  openGraph: {
    type: "website",
    siteName: "42·social",
    title: "42·social — campus network for 42 students",
    description:
      "Minimal social network for 42 / 1337 students. Sign in with Google or 42 Intra.",
  },
  twitter: {
    card: "summary",
    title: "42·social — campus network for 42 students",
    description:
      "Minimal social network for 42 / 1337 students. Sign in with Google or 42 Intra.",
  },
  robots: { index: false, follow: false },
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
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-zinc-50 font-sans text-zinc-900 antialiased dark:bg-black dark:text-zinc-50`}
      >
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white dark:focus:bg-zinc-50 dark:focus:text-zinc-900"
          >
            Skip to content
          </a>
          <PresenceHeartbeat />
          <Navbar />
          <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pt-5 pb-4 sm:max-w-2xl">
            {children}
          </main>
          <Footer />
          <Toaster position="bottom-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
