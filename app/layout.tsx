import { AuthProvider } from "@/contexts/AuthContext";
import { DemoDataProvider } from "@/contexts/DemoDataContext";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/next"
import { NavHeader } from "@/components/ui/nav-header";
import { DemoFooter } from "@/components/ui/DemoFooter";

import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://aiandmyvalues.com';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'AI and My Values',
    template: '%s | AI and My Values',
  },
  description:
    "An interactive demo of the Day chatbot study — exploring how AI extracts, embodies, and explains human values through casual conversation. Published at CHI '26.",
  keywords: [
    'AI values', 'value alignment', 'LLM', 'chatbot', 'human-AI interaction',
    'CHI 2026', 'VAPT', 'Day chatbot', 'conversational AI', 'ETH Zürich',
    'Bhada Yun', 'April Yi Wang', 'value extraction', 'AI companion',
  ],
  authors: [
    { name: 'Bhada Yun', url: 'https://www.bhadayun.com' },
    { name: 'Renn Su', url: 'https://rooyi.github.io' },
    { name: 'April Yi Wang', url: 'https://aprilwang.me' },
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'AI and My Values',
    locale: 'en_US',
    title: 'AI and My Values',
    description:
      "An interactive demo of the Day chatbot study — exploring how AI extracts, embodies, and explains human values through casual conversation.",
    images: [{ url: '/opengraph-image.png', width: 1200, height: 600, alt: 'AI and My Values' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI and My Values',
    description:
      "An interactive demo of the Day chatbot study — exploring how AI extracts, embodies, and explains human values through casual conversation.",
    images: [{ url: '/twitter-image.png', alt: 'AI and My Values' }],
    creator: '@bhadayun',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  },
  icons: {
    icon: '/favicon.ico',
  },
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'AI and My Values',
  url: siteUrl,
  description:
    "An interactive demo of the Day chatbot study — exploring how AI extracts, embodies, and explains human values through casual conversation. Published at CHI '26.",
  author: {
    '@type': 'Person',
    name: 'Bhada Yun',
    url: 'https://www.bhadayun.com',
    affiliation: { '@type': 'Organization', name: 'ETH Zürich' },
  },
  publisher: {
    '@type': 'Person',
    name: 'Bhada Yun',
    url: 'https://www.bhadayun.com',
  },
};

const geistSans = Geist({
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geistSans.className} suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-screen flex flex-col" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <DemoDataProvider>
              <NavHeader />
              <main className="flex-1 flex flex-col min-h-0">
                {children}
              </main>
              <DemoFooter />
            </DemoDataProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
