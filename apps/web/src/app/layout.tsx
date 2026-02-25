import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/landing/theme-provider";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://notipo.com"),
  title: {
    default: "Notipo - Publish from Notion to WordPress, automatically",
    template: "%s | Notipo",
  },
  description:
    "Publish blog posts from Notion to WordPress with automated image handling, featured image generation, code syntax highlighting, and SEO optimization.",
  openGraph: {
    title: "Notipo - Publish from Notion to WordPress, automatically",
    description:
      "Publish blog posts from Notion to WordPress with automated image handling, featured image generation, and SEO optimization.",
    url: "https://notipo.com",
    siteName: "Notipo",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Notipo - Publish from Notion to WordPress, automatically",
    description:
      "Publish blog posts from Notion to WordPress with automated image handling, featured image generation, and SEO optimization.",
  },
  alternates: {
    canonical: "https://notipo.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${dmSans.variable} font-sans antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
